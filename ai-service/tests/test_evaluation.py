# Temporal evaluation tests — deterministic, no pytest needed.
# Run: python tests/test_evaluation.py  (from ai-service/)
#
# Proves: expanding-window chronological separation, no leakage,
# LR-wins fixture, baseline-wins/tied fixture, insufficient-data
# fallback, finite + reproducible + hand-checked metrics.

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evaluation import (  # noqa: E402
    mae,
    rmse,
    rolling_origin_splits,
    smape,
)
from ml_service import build_ml_insights, build_weekly_history  # noqa: E402

PASS = []
FAIL = []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))


def frame(rows):
    df = pd.DataFrame(
        [{"type": t, "category": c, "amount": a, "date": d, "description": desc}
         for t, c, a, d, desc in rows]
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    return df


def monday_sequence(start, weeks):
    base = pd.Timestamp(start, tz="UTC")
    return [base + pd.Timedelta(days=7 * i) for i in range(weeks)]


def weekly_txns(start, incomes, expenses, cat_e="Food"):
    rows = []
    for i, monday in enumerate(monday_sequence(start, len(incomes))):
        rows.append(("income", "Salary", incomes[i], (monday + pd.Timedelta(hours=10)).isoformat(), "salary"))
        rows.append(("expense", cat_e, expenses[i], (monday + pd.Timedelta(days=1, hours=12)).isoformat(), "weekly spend"))
    return rows


def finite_metrics(block):
    if block is None:
        return False
    import math
    for side in ("income", "expense"):
        for k in ("mae", "rmse", "smape"):
            v = block[side][k]
            if not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
                return False
    return True


# --- Unit: metric correctness on a hand-checked example ---------------------
# actual=[100,200], pred=[110,190]: MAE=10, RMSE=10,
# sMAPE = mean(2*10/210, 2*10/390)*100
check("mae hand-check", abs(mae([100, 200], [110, 190]) - 10.0) < 1e-9)
check("rmse hand-check", abs(rmse([100, 200], [110, 190]) - 10.0) < 1e-9)
_expected_smape = ((2 * 10 / 210) + (2 * 10 / 390)) / 2 * 100
check("smape hand-check", abs(smape([100, 200], [110, 190]) - _expected_smape) < 1e-9,
      f"got {smape([100, 200], [110, 190])} want {_expected_smape}")
check("smape zero-safe (0/0 -> 0)", smape([0, 0], [0, 0]) == 0.0)
check("smape zero-actual bounded", 0 <= smape([0, 100], [0, 50]) <= 200)

# --- Unit: rolling splits never shuffle, train strictly before test ---------
splits = rolling_origin_splits(10)
check("splits non-empty for 10 weeks", len(splits) == 10 - 4 - 4 + 1, str(splits))
ok_order = all(a == b and c - b == 4 for a, b, c in splits)
check("splits chronological (train_end == test_start exclusive, 4-week test)", ok_order, str(splits))
# Train indices [0, a) are strictly before test indices [b, c).
check("splits train strictly before test",
      all(a <= b < c and a >= 4 for a, b, c in splits), str(splits))
check("no splits when too short", rolling_origin_splits(7) == [])
check("final split is the latest holdout", splits[-1] == (6, 6, 10), str(splits[-1]))

# --- Fixture 1: strong trend -> LinearRegression should win ------------------
trend_income = [20000] * 12
trend_expense = [500 + 200 * i for i in range(12)]  # 500 .. 2700
trend = build_ml_insights(frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
ev = trend["evaluation"]
check("trend: eligible", ev["eligible"] is True, str(ev))
check("trend: strategy label", ev["splitStrategy"] == "expanding_window_temporal_split")
check("trend: final holdout 4 weeks", ev["finalHoldoutWeeks"] == 4)
check("trend: trainEnd < testStart <= testEnd",
      ev["trainEnd"] < ev["testStart"] <= ev["testEnd"], str({k: ev[k] for k in ("trainEnd", "testStart", "testEnd")}))
check("trend: LR metrics finite", finite_metrics(ev["linearRegression"]), str(ev["linearRegression"]))
check("trend: baseline metrics finite", finite_metrics(ev["historicalAverageBaseline"]), str(ev["historicalAverageBaseline"]))
check("trend: winner is linear_regression", ev["winner"] == "linear_regression", ev["winner"])
check("trend: LR expense MAE beats baseline",
      ev["linearRegression"]["expense"]["mae"] < ev["historicalAverageBaseline"]["expense"]["mae"],
      str((ev["linearRegression"]["expense"], ev["historicalAverageBaseline"]["expense"])))

# --- Fixture 2: flat series -> baseline wins or ties --------------------------
flat = build_ml_insights(frame(weekly_txns("2026-05-04", [10000] * 8, [2000] * 8)))
evf = flat["evaluation"]
check("flat: eligible", evf["eligible"] is True)
check("flat: winner is baseline (tie goes to simpler model)",
      evf["winner"] == "historical_average_baseline", evf["winner"])
check("flat: metrics finite", finite_metrics(evf["linearRegression"]) and finite_metrics(evf["historicalAverageBaseline"]))

# --- Fixture 3: insufficient data -> honest ineligible -------------------------
short = build_ml_insights(frame(weekly_txns("2026-09-28", [5000] * 3, [400] * 3)))
evs = short["evaluation"]
check("short: eligible false", evs["eligible"] is False, str(evs))
check("short: reason explains need", isinstance(evs["reason"], str) and "8" in evs["reason"], str(evs.get("reason")))
check("short: no fake metrics", evs["linearRegression"] is None and evs["historicalAverageBaseline"] is None)
check("short: winner insufficient_data", evs["winner"] == "insufficient_data")

# --- Reproducibility: same input -> identical evaluation -----------------------
again = build_ml_insights(frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
check("evaluation reproducible", again["evaluation"] == trend["evaluation"])

# --- Production forecast uses all history (not truncated to train period) -----
check("production forecast trained on all 12 weeks",
      trend["dataQuality"]["historicalWeeks"] == 12 and trend["modelUsed"] == "linear_regression")

# --- Weekly history helper keeps chronological order ---------------------------
hist = build_weekly_history(frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
check("history sorted oldest-first", bool((hist["weekStart"].diff().dropna() > pd.Timedelta(0)).all()))

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
