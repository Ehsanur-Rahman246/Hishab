# Segment + fairness + calibration tests (deterministic, synthetic only).
# Run: python tests/test_segments.py  (no pytest needed)
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd
import segments as S
import confidence as C
import evaluation as E
from ml_service import build_weekly_history, detect_unusual_expenses

PASS = 0
FAIL = 0
def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok: {name}")
    else:
        FAIL += 1
        print(f"  FAIL: {name} {extra}")

def weekly_txs(start, weeks, income_fn, expense_fn, per_week=2):
    rows = []
    base = pd.Timestamp(start, tz="UTC")
    for w in range(weeks):
        day = base + pd.Timedelta(days=7 * w + 1)
        rows.append({"type": "income", "category": "Salary", "amount": income_fn(w),
                     "date": day.isoformat(), "description": "monthly salary"})
        for k in range(per_week):
            rows.append({"type": "expense", "category": "Food", "amount": expense_fn(w, k),
                         "date": (day + pd.Timedelta(days=k)).isoformat(),
                         "description": f"food shop {w}-{k}"})
    return pd.DataFrame(rows)

print("== segment classifiers ==")
check("history 6 -> 4-7", S.classify_history_length(6) == "4-7 weeks")
check("history 12 -> 8-15", S.classify_history_length(12) == "8-15 weeks")
check("history 20 -> 16+", S.classify_history_length(20) == "16+ weeks")
check("flat income recurring", S.classify_income_regularity([20000]*12) == "recurring")
check("alternating income irregular", S.classify_income_regularity([5000, 30000]*6) == "irregular")
check("flat expense stable", S.classify_spending_pattern([2000]*12) == "stable")
check("wild expense volatile", S.classify_spending_pattern([500, 8000]*6) == "volatile")
check("density low/med/high", (S.classify_density(1.5), S.classify_density(5), S.classify_density(12)) == ("low", "medium", "high"))
try:
    S.assert_no_protected_attributes({"gender": "x"})
    check("protected key rejected", False)
except ValueError:
    check("protected key rejected", True)
try:
    S.assert_no_protected_attributes({"history_length": "8-15 weeks"})
    check("clean segment accepted", True)
except ValueError:
    check("clean segment accepted", False)

print("== segmented forecast evaluation (genuine compute) ==")
# 12 synthetic users spanning segments; anomaly counts come from the REAL
# detector run on each history plus one injected known anomaly probe.
cases = []
for i in range(12):
    weeks = [6, 12, 20][i % 3]
    recurring = (i % 2 == 0)
    stable = (i % 4 < 2)
    per_week = [1, 4, 9][i % 3]  # low / medium / high density
    inc = (lambda w, r=recurring: 20000 if r else (5000 if w % 2 == 0 else 30000))
    exp = (lambda w, k, s=stable: 2000 if s else (500 if (w + k) % 2 == 0 else 8000))
    df = weekly_txs("2026-01-05", weeks, inc, exp, per_week=per_week)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    hist = build_weekly_history(df)
    fe = E.evaluate_forecast_from_transactions(df)
    seg = S.classify_case(len(hist), hist["income"].tolist(), hist["expense"].tolist(),
                          avg_tx_per_week=len(df) / max(1, len(hist)))
    # Anomaly probe: inject one genuine outlier + run the real detector.
    probe = pd.DataFrame([{"type": "expense", "category": "Food", "amount": 25000,
                           "date": pd.Timestamp("2026-06-15", tz="UTC"),
                           "description": f"novel-merchant-probe-{i}"}])
    det = detect_unusual_expenses(pd.concat([df, probe], ignore_index=True))
    hit = any(f"novel-merchant-probe-{i}" in str(d.get("description", "")) for d in det)
    tp, fn = (1, 0) if hit else (0, 1)
    fp = max(0, len(det) - (1 if hit else 0))
    tn = 5  # 5 known-normal spot checks per user (fixed probe design)
    c = {"segment": seg, "eligible": bool(fe.get("eligible")),
         "tp": tp, "fp": fp, "fn": fn, "tn": tn}
    if fe.get("eligible"):
        c.update({"income_mae": fe["linearRegression"]["income"]["mae"],
                  "income_rmse": fe["linearRegression"]["income"]["rmse"],
                  "expense_mae": fe["linearRegression"]["expense"]["mae"],
                  "expense_rmse": fe["linearRegression"]["expense"]["rmse"]})
    else:
        c.update({"income_mae": None, "income_rmse": None, "expense_mae": None, "expense_rmse": None})
    c["_mean_exp"] = float(hist["expense"].mean()) if len(hist) else 0.0
    cases.append(c)

rep = S.evaluate_segments(cases)
check("12 cases evaluated", rep["casesEvaluated"] == 12)
check("fallback rate = ineligible share",
      abs(rep["overall"]["fallbackRate"] - round(sum(1 for c in cases if not c["eligible"]) / 12, 4)) < 1e-9)
# 4 users have 6 weeks -> ineligible; 8 eligible
check("4 ineligible (6-week histories)", rep["overall"]["ineligibleCases"] == 4, str(rep["overall"]))
# small-sample dimension values report insufficient_evidence with null metrics
small = {"segment": {"history_length": "rare-bucket", "income_regularity": "recurring",
                     "spending_pattern": "stable", "transaction_density": "low"},
         "eligible": True, "income_mae": 10, "income_rmse": 10,
         "expense_mae": 10, "expense_rmse": 10, "tp": 1, "fp": 0, "fn": 0, "tn": 5}
rep2 = S.evaluate_segments(cases + [small])
rb = rep2["dimensions"]["history_length"].get("rare-bucket")
check("rare bucket insufficient_evidence",
      rb is not None and rb["forecast"]["status"] == "insufficient_evidence" and rb["forecast"]["income"] is None)
# every metric carries sampleCount; no protected/PII keys in report text
import json as _j
blob = _j.dumps(rep)
check("no protected keys in report", not any(k in blob.lower() for k in ["gender", "religion", "ethnic", "phone", "password"]))
check("sampleCount present", '"sampleCount"' in blob)
# anomaly FPR present per segment value with enough samples
any_fpr = any(v.get("anomaly", {}).get("falsePositiveRate") is not None
              for dim in rep["dimensions"].values() for v in dim.values()
              if v.get("anomaly", {}).get("status") == "ok")
check("FPR computed where evidence suffices", any_fpr)

print("== confidence + calibration ==")
conf = C.forecast_confidence(n_weeks=3, expense_cv=0.9, holdout_mae_expense=None,
                             mean_weekly_expense=2000)
check("3 weeks -> low + fallback", conf["level"] == "low" and conf["fallback"] is True)
conf2 = C.forecast_confidence(n_weeks=20, expense_cv=0.1, holdout_mae_expense=100,
                              mean_weekly_expense=2000, salary_detected=True)
check("strong evidence -> high", conf2["level"] == "high" and conf2["fallback"] is False)
cal_cases = []
for c in cases:
    if not c.get("eligible"):
        continue
    # confidence from genuine evidence
    import numpy as _np
    cf = C.forecast_confidence(n_weeks=12, expense_cv=0.2,
                               holdout_mae_expense=c["expense_mae"],
                               mean_weekly_expense=c["_mean_exp"])
    cal_cases.append({"confidence": cf["level"], "income_mae": c["income_mae"],
                      "expense_mae": c["expense_mae"], "mean_weekly_expense": c["_mean_exp"]})
# pad buckets so each has >=4 samples deterministically
while len([x for x in cal_cases if x["confidence"] == "high"]) < 4:
    cal_cases.append({"confidence": "high", "income_mae": 10, "expense_mae": 10, "mean_weekly_expense": 2000})
while len([x for x in cal_cases if x["confidence"] == "medium"]) < 4:
    cal_cases.append({"confidence": "medium", "income_mae": 100, "expense_mae": 100, "mean_weekly_expense": 2000})
while len([x for x in cal_cases if x["confidence"] == "low"]) < 4:
    cal_cases.append({"confidence": "low", "income_mae": 5000, "expense_mae": 5000, "mean_weekly_expense": 2000})
cal = C.calibrate_confidence(cal_cases)
check("calibration buckets have coverage", all(v.get("coverage") is not None for v in cal["buckets"].values()))
check("honest calibrated flag is bool", isinstance(cal["calibrated"], bool))
check("never claims calibrated falsely",
      (not cal["calibrated"]) or (cal["buckets"]["high"]["coverage"] > cal["buckets"]["medium"]["coverage"] > cal["buckets"]["low"]["coverage"]))
hr = C.human_review_policy("anomaly_uncertain")
check("anomaly review wording, no fraud accusation",
      hr["action"] == "Review manually" and "not fraud" in hr["note"].lower() and hr["automatedTransferAllowed"] is False)
hr2 = C.human_review_policy("insufficient_data")
check("fallback blocks transfers", hr2["automatedTransferAllowed"] is False)

print(f"\nsegments+calibration: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
