# Leakage-safe forecast validation — deterministic, no pytest needed.
# Run: python tests/test_forecast_validation.py  (from ai-service/)
#
# Validates MODEL PERFORMANCE on unseen temporal data (not just behavior):
#  - chronological expanding-window split, latest 4 weeks held out untouched;
#  - LinearRegression vs naive historical-average baseline (train means only);
#  - MAE/RMSE per series, recomputed by INDEPENDENT plain-python math;
#  - spy proofs that no holdout date enters fitting, baseline, or features;
#  - rolling-origin cutoffs + insufficient-data honesty.

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluation as EVAL  # noqa: E402
import patterns as PATTERNS  # noqa: E402
from ml_service import build_ml_insights  # noqa: E402

PASS = []
FAIL = []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))


def frame(rows):
    """Mimic main.py's cleaned DataFrame for (type, category, amount, date, desc)."""
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


def weekly_txns(start, incomes, expenses):
    """One income + one expense per week with realistic intra-week dates."""
    rows = []
    for i, monday in enumerate(monday_sequence(start, len(incomes))):
        rows.append(("income", "Salary", incomes[i],
                     (monday + pd.Timedelta(hours=9, minutes=15)).isoformat(), "monthly salary"))
        rows.append(("expense", "Food", expenses[i],
                     (monday + pd.Timedelta(days=2, hours=13, minutes=40)).isoformat(), "weekly groceries"))
    return rows


# --- Fixtures ---------------------------------------------------------------
# a. Gradual trend: flat income, rising expenses -> LR wins expense, tie income.
TREND_INCOME = [20000] * 12
TREND_EXPENSE = [500 + 200 * i for i in range(12)]
trend_df = frame(weekly_txns("2026-05-04", TREND_INCOME, TREND_EXPENSE))
# b. Flat/stationary: baseline competitive (exact ties expected).
FLAT_INCOME = [10000] * 8
FLAT_EXPENSE = [2000] * 8
flat_df = frame(weekly_txns("2026-05-04", FLAT_INCOME, FLAT_EXPENSE))
# c. Insufficient: only 5 weekly buckets (< 8 needed).
short_df = frame(weekly_txns("2026-09-28", [5000] * 5, [400] * 5))


def plain_mean(xs):
    return sum(xs) / len(xs)


def plain_least_squares_predict(train, horizon):
    """Independent closed-form OLS (no sklearn): slope/intercept from scratch."""
    n = len(train)
    xs = list(range(n))
    xbar = plain_mean(xs)
    ybar = plain_mean(train)
    denom = sum((x - xbar) ** 2 for x in xs)
    slope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, train)) / denom if denom else 0.0
    intercept = ybar - slope * xbar
    return [max(0.0, slope * (n + h) + intercept) for h in range(horizon)]


def plain_mae_rmse(actual, pred):
    mae = sum(abs(a - p) for a, p in zip(actual, pred)) / len(actual)
    rmse = (sum((a - p) ** 2 for a, p in zip(actual, pred)) / len(actual)) ** 0.5
    return mae, rmse


# --- Schema -----------------------------------------------------------------
fe = EVAL.evaluate_forecast_from_transactions(trend_df)
check("schema: strategy name",
      fe["splitStrategy"] == "expanding_window_temporal_holdout", fe["splitStrategy"])
check("schema: horizon 4 + eligible",
      fe["horizonWeeks"] == 4 and fe["eligible"] is True and fe["reason"] is None)
for key in ("trainStart", "trainEnd", "testStart", "testEnd"):
    check(f"schema: {key} is YYYY-MM-DD",
          isinstance(fe[key], str) and len(fe[key]) == 10, str(fe[key]))
check("schema: chronological order",
      fe["trainStart"] <= fe["trainEnd"] < fe["testStart"] <= fe["testEnd"],
      f"{fe['trainStart']}..{fe['trainEnd']} | {fe['testStart']}..{fe['testEnd']}")
check("schema: test window is 4 consecutive weeks (21-day span)",
      (pd.Timestamp(fe["testEnd"]) - pd.Timestamp(fe["testStart"])).days == 21)
check("schema: per-series winner enums",
      set(fe["winner"].keys()) == {"income", "expense"}
      and all(v in ("linear_regression", "historical_average_baseline", "tie") for v in fe["winner"].values()),
      str(fe["winner"]))
check("schema: metric blocks present",
      all(k in fe["linearRegression"] and k in fe["historicalAverageBaseline"] for k in ("income", "expense"))
      and all(set(fe[m][s].keys()) == {"mae", "rmse"} for m in ("linearRegression", "historicalAverageBaseline") for s in ("income", "expense")))

# --- Exact dates: 12 weeks from 2026-05-04, holdout = last 4 -----------------
check("dates: train 2026-05-04..2026-06-22",
      fe["trainStart"] == "2026-05-04" and fe["trainEnd"] == "2026-06-22",
      f"{fe['trainStart']}..{fe['trainEnd']}")
check("dates: test 2026-06-29..2026-07-20",
      fe["testStart"] == "2026-06-29" and fe["testEnd"] == "2026-07-20",
      f"{fe['testStart']}..{fe['testEnd']}")

# --- Independent metric recomputation (no sklearn, no evaluation.py math) ----
# Train weeks = first 8 (income 20000 flat; expense 500..1900 step 200).
# Test weeks 9-12: income 20000 each; expense 2100, 2300, 2500, 2700.
exp_test = [2100.0, 2300.0, 2500.0, 2700.0]
inc_test = [20000.0] * 4
lr_exp = plain_least_squares_predict([float(x) for x in TREND_EXPENSE[:8]], 4)
ha_exp = [plain_mean([float(x) for x in TREND_EXPENSE[:8]])] * 4
lr_inc = plain_least_squares_predict([float(x) for x in TREND_INCOME[:8]], 4)
ha_inc = [plain_mean([float(x) for x in TREND_INCOME[:8]])] * 4
exp_lr_mae, exp_lr_rmse = plain_mae_rmse(exp_test, lr_exp)
exp_ha_mae, exp_ha_rmse = plain_mae_rmse(exp_test, ha_exp)
exp_inc_lr_mae, _ = plain_mae_rmse(inc_test, lr_inc)
TOL = 1e-4  # outputs are rounded to 4 decimals for presentation only
check("metrics: LR expense MAE matches independent OLS",
      abs(fe["linearRegression"]["expense"]["mae"] - exp_lr_mae) < TOL,
      f"{fe['linearRegression']['expense']['mae']} vs {exp_lr_mae}")
check("metrics: LR expense RMSE matches independent OLS",
      abs(fe["linearRegression"]["expense"]["rmse"] - exp_lr_rmse) < TOL)
check("metrics: baseline expense MAE matches independent mean",
      abs(fe["historicalAverageBaseline"]["expense"]["mae"] - exp_ha_mae) < TOL)
check("metrics: baseline expense RMSE matches independent mean",
      abs(fe["historicalAverageBaseline"]["expense"]["rmse"] - exp_ha_rmse) < TOL)
check("metrics: LR expense predictions are perfect on a clean trend",
      fe["linearRegression"]["expense"]["mae"] == 0.0,
      str(fe["linearRegression"]["expense"]))
check("metrics: all finite and non-negative",
      all(v >= 0 and v == v and v != float("inf")
          for m in ("linearRegression", "historicalAverageBaseline")
          for s in ("income", "expense") for v in fe[m][s].values()))

# --- Winner selection ---------------------------------------------------------
check("winner: LR wins trending expense",
      fe["winner"]["expense"] == "linear_regression", str(fe["winner"]))
check("winner: flat income is a tie (not a false LR win)",
      fe["winner"]["income"] == "tie", str(fe["winner"]))
check("winner: flat income MAE is 0 for both",
      fe["linearRegression"]["income"]["mae"] == 0.0
      and fe["historicalAverageBaseline"]["income"]["mae"] == 0.0)

fe_flat = EVAL.evaluate_forecast_from_transactions(flat_df)
check("flat: both series tie on stationary data",
      fe_flat["eligible"] is True and fe_flat["winner"] == {"income": "tie", "expense": "tie"},
      str(fe_flat["winner"]))

fe_short = EVAL.evaluate_forecast_from_transactions(short_df)
check("short: eligible=false with honest reason",
      fe_short["eligible"] is False and isinstance(fe_short["reason"], str) and "5" in fe_short["reason"],
      str(fe_short))
check("short: metrics and winner are null (never invented)",
      fe_short["linearRegression"] is None and fe_short["historicalAverageBaseline"] is None
      and fe_short["winner"] is None
      and all(fe_short[k] is None for k in ("trainStart", "trainEnd", "testStart", "testEnd")))

# --- Prediction length ----------------------------------------------------------
check("fit: LR predicts exactly `horizon` values",
      len(EVAL._fit_linear_regression([1.0, 2.0, 3.0, 4.0, 5.0], 4)) == 4)
check("fit: baseline predicts exactly `horizon` values",
      len(EVAL._fit_historical_average([10.0, 20.0], 4)) == 4)
check("fit: baseline uses the training mean only",
      EVAL._fit_historical_average([10.0, 20.0, 30.0], 2) == [20.0, 20.0])

# --- Leakage spies: no holdout date may enter fitting/baseline/features -------
seen = {"lr_calls": [], "ha_calls": []}

orig_lr, orig_ha = EVAL._fit_linear_regression, EVAL._fit_historical_average
orig_salary, orig_fest = PATTERNS.detect_salary_pattern, PATTERNS.estimate_festival_adjustment
try:
    def rec_lr(train_vals, horizon=4):
        seen["lr_calls"].append([float(v) for v in train_vals])
        return orig_lr(train_vals, horizon)

    def rec_ha(train_vals, horizon=4):
        seen["ha_calls"].append([float(v) for v in train_vals])
        return orig_ha(train_vals, horizon)

    def rec_salary(train_df):
        seen["salary_max_date"] = pd.Timestamp(train_df["date"].max())
        seen["salary_n"] = len(train_df)
        return orig_salary(train_df)

    def rec_fest(train_history, horizon_starts, festival_dates=None):
        seen["fest_max_week"] = pd.Timestamp(train_history["weekStart"].max())
        return orig_fest(train_history, horizon_starts, festival_dates)

    EVAL._fit_linear_regression = rec_lr
    EVAL._fit_historical_average = rec_ha
    PATTERNS.detect_salary_pattern = rec_salary
    PATTERNS.estimate_festival_adjustment = rec_fest

    fe_spy = EVAL.evaluate_forecast_from_transactions(trend_df)
    cutoff = pd.Timestamp(fe_spy["testStart"], tz="UTC")
    n_train_weeks = 8
    exp_inc = [float(x) for x in TREND_INCOME[:8]]
    exp_exp = [float(x) for x in TREND_EXPENSE[:8]]
    check("leak: trend fit called twice (income+expense) on 8 training weeks each",
          len(seen["lr_calls"]) == 2 and all(len(c) == n_train_weeks for c in seen["lr_calls"]),
          str([len(c) for c in seen["lr_calls"]]))
    check("leak: trend-fit inputs are exactly the training weeks (no holdout value)",
          sorted(seen["lr_calls"]) == sorted([exp_inc, exp_exp]))
    check("leak: baseline inputs are exactly the training weeks (train means only)",
          len(seen["ha_calls"]) == 2 and sorted(seen["ha_calls"]) == sorted([exp_inc, exp_exp]))
    check("leak: salary search saw no holdout date",
          seen.get("salary_max_date") < cutoff, str(seen.get("salary_max_date")))
    check("leak: festival estimator saw no holdout week",
          seen.get("fest_max_week") < cutoff, str(seen.get("fest_max_week")))
    check("leak: all train transactions strictly before cutoff",
          (trend_df[trend_df["date"] < cutoff].shape[0] == seen.get("salary_n")),
          f"{seen.get('salary_n')} train rows before {fe_spy['testStart']}")

    # Split helper itself: disjoint, chronological, no gaps.
    tr, te = EVAL.split_transactions_by_cutoff(
        EVAL._clean_transactions(trend_df), cutoff)
    check("leak: split covers every transaction exactly once",
          len(tr) + len(te) == len(trend_df) and len(tr) == 16 and len(te) == 8,
          f"{len(tr)}+{len(te)} vs {len(trend_df)}")
    check("leak: split boundary is exact (train max < cutoff <= test min)",
          pd.Timestamp(tr["date"].max()) < cutoff <= pd.Timestamp(te["date"].min()))
finally:
    EVAL._fit_linear_regression = orig_lr
    EVAL._fit_historical_average = orig_ha
    PATTERNS.detect_salary_pattern = orig_salary
    PATTERNS.estimate_festival_adjustment = orig_fest

# --- Rolling-origin evaluation --------------------------------------------------
roll = EVAL.rolling_origin_evaluation(trend_df)
check("rolling: 5 cutoffs for 12 weeks (8 train-min + 4 horizon)",
      len(roll["cutoffs"]) == 5, str(len(roll["cutoffs"])))
check("rolling: cutoffs chronological, train strictly before test",
      all(c["trainEnd"] < c["testStart"] <= c["testEnd"] for c in roll["cutoffs"]))
check("rolling: each test window spans 21 days",
      all((pd.Timestamp(c["testEnd"]) - pd.Timestamp(c["testStart"])).days == 21 for c in roll["cutoffs"]))
check("rolling: final cutoff IS the untouched holdout",
      roll["finalHoldout"]["testStart"] == fe["testStart"]
      and roll["finalHoldout"]["testEnd"] == fe["testEnd"]
      and roll["finalHoldout"]["linearRegression"] == fe["linearRegression"]
      and roll["finalHoldout"]["historicalAverageBaseline"] == fe["historicalAverageBaseline"],
      str(roll["finalHoldout"]["testStart"]))
check("rolling: aggregate means match the per-cutoff values",
      abs(roll["aggregate"]["linearRegression"]["expense"]["mae"]
          - sum(c["linearRegression"]["expense"]["mae"] for c in roll["cutoffs"]) / len(roll["cutoffs"])) < 1e-9)
check("rolling: insufficient data yields no cutoffs",
      EVAL.rolling_origin_evaluation(short_df)["cutoffs"] == []
      and EVAL.rolling_origin_evaluation(short_df)["finalHoldout"] is None)

# --- Determinism ------------------------------------------------------------------
fe_again = EVAL.evaluate_forecast_from_transactions(trend_df)
check("determinism: identical output on repeat run", fe_again == fe)

# --- Production response carries the new object ------------------------------------
insights = build_ml_insights(trend_df)
check("response: mlInsights includes forecastEvaluation",
      "forecastEvaluation" in insights and insights["forecastEvaluation"]["eligible"] is True,
      str(sorted(insights.keys())))
check("response: production forecastEvaluation matches direct evaluation",
      insights["forecastEvaluation"] == fe)
check("response: legacy evaluation key preserved",
      "evaluation" in insights and insights["evaluation"]["eligible"] is True)

print(f"\n{len(PASS)} passed, {len(FAIL)} failed.")
sys.exit(1 if FAIL else 0)
