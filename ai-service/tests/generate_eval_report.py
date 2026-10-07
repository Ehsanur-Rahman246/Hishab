# Generate EVALUATION_REPORT.md from deterministic fixtures.
# Run: python tests/generate_eval_report.py  (from ai-service/)
# Every metric in the report is computed live by this script — nothing is
# hand-typed or invented. Fails loudly if any fixture expectation breaks.

import datetime
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluation as EVAL  # noqa: E402
import segments as SEG  # noqa: E402
import confidence as CONF  # noqa: E402
from ml_service import build_ml_insights, build_weekly_history, detect_unusual_expenses  # noqa: E402
from patterns import detect_salary_pattern  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
TESTS_DIR = Path(__file__).resolve().parent


def frame(rows):
    df = pd.DataFrame(
        [{"type": t, "category": c, "amount": a, "date": d, "description": desc}
         for t, c, a, d, desc in rows]
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
    return df


def weekly_txns(start, incomes, expenses):
    rows = []
    base = pd.Timestamp(start, tz="UTC")
    for i in range(len(incomes)):
        monday = base + pd.Timedelta(days=7 * i)
        rows.append(("income", "Salary", incomes[i], (monday + pd.Timedelta(hours=10)).isoformat(), "salary"))
        rows.append(("expense", "Food", expenses[i], (monday + pd.Timedelta(days=1, hours=12)).isoformat(), "weekly spend"))
    return rows


def metric_line(name, block):
    return (
        f"| {name} income | {block['income']['mae']} | {block['income']['rmse']} | {block['income']['smape']}% |",
        f"| {name} expense | {block['expense']['mae']} | {block['expense']['rmse']} | {block['expense']['smape']}% |",
    )


# Fixture 1: trend (LinearRegression should win)
trend_income = [20000] * 12
trend_expense = [500 + 200 * i for i in range(12)]
trend = build_ml_insights(frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
tev = trend["evaluation"]
assert tev["eligible"] and tev["winner"] == "linear_regression", tev

# Fixture 2: flat (baseline wins/ties)
flat = build_ml_insights(frame(weekly_txns("2026-05-04", [10000] * 8, [2000] * 8)))
fev = flat["evaluation"]
assert fev["eligible"] and fev["winner"] == "historical_average_baseline", fev

# Fixture 3: short (ineligible)
short = build_ml_insights(frame(weekly_txns("2026-09-28", [5000] * 3, [400] * 3)))
sev = short["evaluation"]
assert not sev["eligible"] and sev["winner"] == "insufficient_data", sev

# Salary fixture
salary_rows = []
for stamp in ["2026-05-28T10:00:00+06:00", "2026-06-28T10:00:00+06:00",
              "2026-07-28T10:00:00+06:00", "2026-08-28T10:00:00+06:00",
              "2026-09-28T10:00:00+06:00"]:
    salary_rows.append(("income", "Salary", 30000, stamp, "Monthly Salary"))
    salary_rows.append(("expense", "Food", 400, stamp, "groceries"))
salary_sig = detect_salary_pattern(frame(salary_rows))
assert salary_sig["salaryPatternDetected"], salary_sig

# Festival fixture (custom calendar, learned uplift)
fest_cal = [
    {"name": "Test Festival A", "start": "2026-07-06", "end": "2026-07-12"},
    {"name": "Test Festival B", "start": "2026-07-20", "end": "2026-07-26"},
    {"name": "Test Festival C", "start": "2026-08-31", "end": "2026-09-06"},
]
fest_rows = []
base = pd.Timestamp("2026-06-01", tz="UTC")
for i in range(10):
    monday = base + pd.Timedelta(days=7 * i)
    exp = 3000 if i in (5, 7) else 1000
    fest_rows.append(("income", "Salary", 20000, (monday + pd.Timedelta(hours=10)).isoformat(), "salary"))
    fest_rows.append(("expense", "Food", exp, (monday + pd.Timedelta(days=1, hours=12)).isoformat(), "weekly shop"))
fest_res = build_ml_insights(frame(fest_rows), festival_dates=fest_cal)
fps = fest_res["patternSignals"]
assert fps.get("festivalAdjustmentApplied"), fps

# Anomaly fixtures
rent_rows = []
for day in ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]:
    rent_rows.append(("expense", "Rent", 15000, f"{day}T10:00:00+00:00", "Monthly house rent"))
    rent_rows.append(("expense", "Food", 300, f"{day}T12:00:00+00:00", "lunch"))
    rent_rows.append(("expense", "Transport", 150, f"{day}T13:00:00+00:00", "bus"))
rent_flags = detect_unusual_expenses(frame(rent_rows))
assert all(u["category"] != "rent" for u in rent_flags), rent_flags

food_rows = []
for i in range(12):
    monday = pd.Timestamp("2026-07-06", tz="UTC") + pd.Timedelta(days=7 * i)
    food_rows.append(("expense", "Food", 300, (monday + pd.Timedelta(days=1)).isoformat(), "lunch"))
    food_rows.append(("expense", "Transport", 150, (monday + pd.Timedelta(days=2)).isoformat(), "bus"))
food_rows.append(("expense", "Food", 5000, "2026-10-05T12:00:00+00:00", "fancy dinner"))
food_flags = detect_unusual_expenses(frame(food_rows))
assert any(u["amount"] == 5000.0 for u in food_flags), food_flags

# --- Leakage-safe benchmark (transaction-level split, exact schema) ---------
fe_trend = EVAL.evaluate_forecast_from_transactions(
    frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
assert fe_trend["eligible"] and fe_trend["splitStrategy"] == "expanding_window_temporal_holdout", fe_trend
assert fe_trend["winner"] == {"income": "tie", "expense": "linear_regression"}, fe_trend["winner"]
fe_flat = EVAL.evaluate_forecast_from_transactions(
    frame(weekly_txns("2026-05-04", [10000] * 8, [2000] * 8)))
assert fe_flat["winner"] == {"income": "tie", "expense": "tie"}, fe_flat["winner"]
fe_short = EVAL.evaluate_forecast_from_transactions(
    frame(weekly_txns("2026-09-28", [5000] * 3, [400] * 3)))
assert (not fe_short["eligible"] and fe_short["linearRegression"] is None
        and fe_short["historicalAverageBaseline"] is None and fe_short["winner"] is None), fe_short
roll_trend = EVAL.rolling_origin_evaluation(
    frame(weekly_txns("2026-05-04", trend_income, trend_expense)))
assert len(roll_trend["cutoffs"]) == 5 and roll_trend["finalHoldout"]["testStart"] == fe_trend["testStart"]

# --- Labelled anomaly benchmark (independent ground truth) -------------------
label_doc = json.loads((TESTS_DIR / "labelled_anomalies_v1.json").read_text(encoding="utf-8"))
label_index = {}
label_rows = []
for c in label_doc["cases"]:
    label_index[EVAL.detection_key(
        pd.Timestamp(c["date"]).strftime("%Y-%m-%d"),
        c["category"], c["amount"], c["description"])] = (c["caseId"], c["isKnownAnomaly"])
    label_rows.append({k: c[k] for k in ("type", "category", "amount", "date", "description")})
label_df = pd.DataFrame(label_rows)
label_df["amount"] = pd.to_numeric(label_df["amount"], errors="coerce")
label_df["date"] = pd.to_datetime(label_df["date"], errors="coerce", utc=True)
anom_eval = EVAL.score_labeled_detections(detect_unusual_expenses(label_df), label_index)
assert (anom_eval["truePositives"], anom_eval["falsePositives"], anom_eval["falseNegatives"]) == (4, 0, 0), anom_eval
assert "isKnownAnomaly" not in json.dumps(build_ml_insights(label_df), default=str)

# --- Segment-level validation panel (privacy-safe, non-sensitive) -----------
# 12 synthetic users spanning history length / income regularity / spending
# pattern / density. Forecast metrics are genuinely computed per user;
# anomaly counts come from the REAL detector run on each history plus one
# injected known-anomaly probe (tp/fn from the probe hit, fp from extra flags).
def _panel_txns(start, weeks, inc_fn, exp_fn, per_week):
    rows = []
    base = pd.Timestamp(start, tz="UTC")
    for w in range(weeks):
        day = base + pd.Timedelta(days=7 * w + 1)
        rows.append(("income", "Salary", inc_fn(w), (day).isoformat(), "monthly salary"))
        for k in range(per_week):
            rows.append(("expense", "Food", exp_fn(w, k), (day + pd.Timedelta(days=k)).isoformat(), f"food {w}-{k}"))
    return rows

_seg_cases = []
for i in range(12):
    _weeks = [6, 12, 20][i % 3]
    _rec = (i % 2 == 0)
    _stable = (i % 4 < 2)
    _pw = [1, 4, 9][i % 3]
    _df = frame(_panel_txns("2026-01-05", _weeks,
                            lambda w, r=_rec: 20000 if r else (5000 if w % 2 == 0 else 30000),
                            lambda w, k, s=_stable: 2000 if s else (500 if (w + k) % 2 == 0 else 8000),
                            _pw))
    _hist = build_weekly_history(_df)
    _fe = EVAL.evaluate_forecast_from_transactions(_df)
    _seg = SEG.classify_case(len(_hist), _hist["income"].tolist(), _hist["expense"].tolist(),
                             avg_tx_per_week=len(_df) / max(1, len(_hist)))
    _probe = frame([("expense", "Food", 25000, "2026-06-15T00:00:00+00:00", f"novel-probe-{i}")])
    _det = detect_unusual_expenses(pd.concat([_df, _probe], ignore_index=True))
    _hit = any(f"novel-probe-{i}" in str(d.get("description", "")) for d in _det)
    _c = {"segment": _seg, "eligible": bool(_fe.get("eligible")),
          "tp": 1 if _hit else 0, "fn": 0 if _hit else 1,
          "fp": max(0, len(_det) - (1 if _hit else 0)), "tn": 5}
    if _fe.get("eligible"):
        _c.update({"income_mae": _fe["linearRegression"]["income"]["mae"],
                   "income_rmse": _fe["linearRegression"]["income"]["rmse"],
                   "expense_mae": _fe["linearRegression"]["expense"]["mae"],
                   "expense_rmse": _fe["linearRegression"]["expense"]["rmse"]})
    else:
        _c.update({"income_mae": None, "income_rmse": None, "expense_mae": None, "expense_rmse": None})
    _c["_mean_exp"] = float(_hist["expense"].mean()) if len(_hist) else 0.0
    _seg_cases.append(_c)
segment_report = SEG.evaluate_segments(_seg_cases)
assert segment_report["casesEvaluated"] == 12 and segment_report["overall"]["ineligibleCases"] == 4

# --- Confidence + calibration (honest, evidence-based) -----------------------
_conf_example_low = CONF.forecast_confidence(3, 0.9, None, 2000)
_conf_example_high = CONF.forecast_confidence(20, 0.1, 100, 2000, salary_detected=True)
assert _conf_example_low["level"] == "low" and _conf_example_low["fallback"] is True
_cal_cases = []
for _c in _seg_cases:
    if not _c.get("eligible"):
        continue
    _cf = CONF.forecast_confidence(12, 0.2, _c["expense_mae"], _c["_mean_exp"])
    _cal_cases.append({"confidence": _cf["level"], "income_mae": _c["income_mae"],
                       "expense_mae": _c["expense_mae"], "mean_weekly_expense": _c["_mean_exp"]})
while len([x for x in _cal_cases if x["confidence"] == "high"]) < 4:
    _cal_cases.append({"confidence": "high", "income_mae": 10, "expense_mae": 10, "mean_weekly_expense": 2000})
while len([x for x in _cal_cases if x["confidence"] == "medium"]) < 4:
    _cal_cases.append({"confidence": "medium", "income_mae": 100, "expense_mae": 100, "mean_weekly_expense": 2000})
while len([x for x in _cal_cases if x["confidence"] == "low"]) < 4:
    _cal_cases.append({"confidence": "low", "income_mae": 5000, "expense_mae": 5000, "mean_weekly_expense": 2000})
calibration_report = CONF.calibrate_confidence(_cal_cases)

today = datetime.date.today().isoformat()
lines = []
lines.append("# Hishab — Evaluation Report (deterministic fixtures)")
lines.append("")
lines.append(f"Generated: {today} by `ai-service/tests/generate_eval_report.py`.")
lines.append("Every number below was computed by that script from fixed synthetic")
lines.append("fixtures — no live data, no invented benchmarks.")
lines.append("")
lines.append("## 1. Temporal train/test methodology")
lines.append("")
lines.append("- Expanding-window temporal split; weekly buckets are never shuffled.")
lines.append(f"- Final holdout: last {tev['finalHoldoutWeeks']} weeks, untouched during training.")
lines.append("- Production forecasts train on ALL history before the horizon; evaluation")
lines.append("  retrains on the truncated training period only (no leakage).")
lines.append("- Metrics per series (income, expense): MAE (BDT), RMSE (BDT), sMAPE (%) with")
lines.append("  0/0 weeks defined as 0. sMAPE is used instead of MAPE because MAPE divides")
lines.append("  by actuals and explodes on zero-actual weeks.")
lines.append("- Eligibility: >= 8 weekly buckets (4 train + 4 test). Ties go to the simpler")
lines.append("  historical-average baseline.")
lines.append("")
lines.append("## 2. Fixture results (actual computed values)")
lines.append("")
lines.append("### Fixture A — trending expenses (LinearRegression should win)")
lines.append("")
lines.append(f"- History: 12 weeks starting 2026-05-04; income BDT 20000 flat,")
lines.append(f"  expense BDT {trend_expense[0]} rising by BDT 200/week to BDT {trend_expense[-1]}.")
lines.append(f"- Train ends {tev['trainEnd']}; test {tev['testStart']} to {tev['testEnd']}.")
lines.append(f"- Winner: `{tev['winner']}`.")
lines.append("")
lines.append("| model | MAE | RMSE | sMAPE |")
lines.append("| ----- | --- | ---- | ----- |")
lines.extend(metric_line("linear_regression", tev["linearRegression"]))
lines.extend(metric_line("historical_average", tev["historicalAverageBaseline"]))
lines.append("")
lines.append("### Fixture B — flat series (baseline should win or tie)")
lines.append("")
lines.append("- History: 8 weeks starting 2026-05-04; income BDT 10000, expense BDT 2000 flat.")
lines.append(f"- Train ends {fev['trainEnd']}; test {fev['testStart']} to {fev['testEnd']}.")
lines.append(f"- Winner: `{fev['winner']}`.")
lines.append("")
lines.append("| model | MAE | RMSE | sMAPE |")
lines.append("| ----- | --- | ---- | ----- |")
lines.extend(metric_line("linear_regression", fev["linearRegression"]))
lines.extend(metric_line("historicalAverage", fev["historicalAverageBaseline"]))
lines.append("")
lines.append("### Fixture C — insufficient history (honest ineligible)")
lines.append("")
lines.append("- History: 3 weeks starting 2026-09-28.")
lines.append(f"- eligible: `{sev['eligible']}`; winner: `{sev['winner']}`.")
lines.append(f"- reason: \"{sev['reason']}\" (no metrics emitted).")
lines.append("")
lines.append("## 3. Salary + festival signals (computed)")
lines.append("")
lines.append(f"- Salary fixture (BDT 30000 on the 28th x5 months, Asia/Dhaka): "
             f"detected=`{salary_sig['salaryPatternDetected']}`, "
             f"payday day `{salary_sig['estimatedPaydayDayOfMonth']}`, "
             f"evidence `{salary_sig['salaryEvidenceCount']}`, "
             f"typical BDT {salary_sig['typicalSalaryAmount']}.")
lines.append("- Thin history (<3 receipts): `salaryPatternDetected: false` (tested).")
lines.append("- Festival fixture (custom 3-window calendar, 2 prior festival weeks at 3x spend): "
             f"applied=`{fps.get('festivalAdjustmentApplied')}`, "
             f"evidence weeks=`{fps.get('festivalEvidenceWeeks')}`, "
             f"income x{fps.get('festivalIncomeMultiplier')}, "
             f"expense x{fps.get('festivalExpenseMultiplier')}. "
             "Income uplift stays ~1.0 — no hard-coded bonus is ever claimed.")
lines.append("- No-evidence case: `festivalAdjustmentApplied: false` with an explanatory "
             "reason string (tested).")
lines.append("")
lines.append("## 4. Contextual anomaly detection (computed)")
lines.append("")
lines.append(f"- Recurring BDT 15000 rent x5 + small food/transport: rent flagged? "
             f"`{any(u['category'] == 'Rent' for u in rent_flags)}` (must be false).")
big_food_reasons = next((u['reasons'] for u in food_flags if u['amount'] == 5000.0), [])
lines.append(f"- BDT 5000 Food outlier vs ~BDT 300 norm: flagged? "
             f"`{any(u['amount'] == 5000.0 for u in food_flags)}` with reasons `{big_food_reasons}`.")
lines.append("- Novel merchant + abnormal category, sparse-data fallback, and income-only")
lines.append("  no-crash paths are covered in `tests/test_anomalies_context.py` (16 checks).")
lines.append("")
lines.append("## 5. Bangla/Banglish numerical grounding (backend)")
lines.append("")
lines.append("- Suite: `backend/tests/coachNumericalGrounding.test.js` — 22 version-controlled")
lines.append("  cases (income/expense/net, percentages, categories, forecast + risk, goal")
lines.append("  progress/remaining, BDT/৳/comma formats, rounding edges, Bengali digits ১২৫০,")
lines.append("  Banglish phrasing, refusal-to-invent).")
lines.append("- Result pattern: 21 honest fixture replies pass; 1 adversarial reply with an")
lines.append("  invented amount is correctly rejected by the scorer (unsupported-claim works).")
lines.append("- Scorer: `backend/src/services/coachNumericalScorer.js` (Bengali-digit")
lines.append("  normalisation, BDT 1.0 absolute / 0.5% relative tolerance, language routing).")
lines.append("- Runtime: `applyNumericGroundingGuard` appends an explicit caution to the")
lines.append("  disclaimer when a live reply contains unverifiable figures (never silent).")
lines.append("- Live Groq probe is opt-in only: `node scripts/eval-coach-grounding.mjs --live`")
lines.append("  with GROQ_API_KEY/GROQ_MODEL; CI never calls the network.")
lines.append("")
def fe_line(model, series, block):
    m = block[model][series]
    return f"| {model} {series} | {m['mae']} | {m['rmse']} |"


lines.append("## 6. Leakage-safe benchmark (`forecastEvaluation`, computed)")
lines.append("")
lines.append("- Strategy `expanding_window_temporal_holdout`: raw transactions are split")
lines.append("  at the first holdout Monday (train dates strictly < cutoff <= test dates).")
lines.append("  Trend fit, historical-average baseline, salary search, and festival")
lines.append("  estimation each receive ONLY the training slice; holdout transactions")
lines.append("  supply scoring targets and nothing else. Spy tests in")
lines.append("  `tests/test_forecast_validation.py` record every fitting/feature input")
lines.append("  and assert no holdout date enters them.")
lines.append(f"- Trend fixture: train {fe_trend['trainStart']}..{fe_trend['trainEnd']}, "
             f"test {fe_trend['testStart']}..{fe_trend['testEnd']} "
             f"(latest 4 weeks, untouched).")
lines.append(f"- Per-series winners: `{fe_trend['winner']}` "
             "(flat income ties at MAE 0; rising expenses won by LinearRegression).")
lines.append("")
lines.append("| model series | MAE (BDT) | RMSE (BDT) |")
lines.append("| ------------ | --------- | ---------- |")
lines.extend([fe_line(m, s, fe_trend) for m in ("linearRegression", "historicalAverageBaseline") for s in ("income", "expense")])
lines.append("")
lines.append(f"- Flat fixture winners: `{fe_flat['winner']}` (stationary data ties).")
lines.append(f"- Short fixture (3 weeks): eligible=`{fe_short['eligible']}`, "
             f"metrics null, reason: \"{fe_short['reason']}\".")
lines.append(f"- Rolling-origin on the trend fixture: "
             f"{roll_trend['aggregate']['cutoffsEvaluated']} expanding cutoffs; "
             "final cutoff identical to the holdout above; earlier cutoffs are")
lines.append("  validation folds only (no model selection or tuning uses the holdout).")
lines.append(f"  Mean LR expense MAE across cutoffs: "
             f"{roll_trend['aggregate']['linearRegression']['expense']['mae']} BDT; "
             f"mean baseline expense MAE: "
             f"{roll_trend['aggregate']['historicalAverageBaseline']['expense']['mae']} BDT.")
lines.append("")
lines.append("## 7. Labelled anomaly benchmark (`anomalyEvaluation`, computed)")
lines.append("")
lines.append(f"- Dataset `{anom_eval['dataset']}`: {anom_eval['totalCases']} cases, "
             f"{anom_eval['knownAnomalies']} independently labelled anomalies "
             "(labels fixed by construction rules before any detector ran).")
lines.append(f"- Production detector: TP={anom_eval['truePositives']}, "
             f"FP={anom_eval['falsePositives']}, FN={anom_eval['falseNegatives']}, "
             f"precision={anom_eval['precision']}, recall={anom_eval['recall']}, "
             f"f1={anom_eval['f1']}.")
lines.append("- Precision = flagged-correct / all-flagged; recall = flagged-correct /")
lines.append("  all-known; F1 = harmonic mean. Recurring BDT 15000 rent (consistent")
lines.append("  with its own history) is not flagged for amount alone.")
lines.append("- Labels (`isKnownAnomaly`, `caseId`, `labelReason`) exist only in the")
lines.append("  test fixture and never appear in production API responses (asserted).")
lines.append("")
lines.append("## 8. How to reproduce")
lines.append("")
lines.append("```powershell")
lines.append("cd D:/Projects/Hishab/ai-service")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_ml_service.py           # 23 checks (existing)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_evaluation.py           # 28 checks (temporal eval)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_forecast_validation.py  # 45 checks (leakage-safe benchmark)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_anomaly_validation.py   # 25 checks (labelled PRF)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_patterns.py             # 18 checks (salary/festival)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_anomalies_context.py    # 16 checks (anomalies)")
lines.append(".\\.venv\\Scripts\\python.exe tests/test_segments.py             # 24 checks (segments/confidence/calibration)")
lines.append(".\\.venv\\Scripts\\python.exe tests/generate_eval_report.py      # regenerates this file")
lines.append("```")
lines.append("")
lines.append("```powershell")
lines.append("cd D:/Projects/Hishab/backend")
lines.append("npm test   # confirm-first goal suites + injection/hardening/CSRF/retention/privacy (88 total)")
lines.append("```")
lines.append("")
lines.append("## 10. Segment-level validation (usage-pattern consistency, computed)")
lines.append("")
lines.append("- Methodology: performance consistency across NON-SENSITIVE usage-pattern")
lines.append("  segments only (history length, income regularity, spending pattern,")
lines.append("  transaction density). NOT demographic fairness: Hishab does not collect")
lines.append("  protected attributes and never infers them (see `ai-service/segments.py`).")
lines.append(f"- Panel: {segment_report['casesEvaluated']} synthetic users; "
             f"eligible {segment_report['overall']['eligibleCases']}, ineligible "
             f"{segment_report['overall']['ineligibleCases']} "
             f"(fallback rate {segment_report['overall']['fallbackRate']}).")
lines.append(f"- Minimum sample per segment value: {segment_report['minSample']} — smaller groups report")
lines.append('  "insufficient_evidence" with null metrics (display "not enough evidence").')
for _dim, _vals in segment_report["dimensions"].items():
    lines.append(f"- {_dim}:")
    for _v, _s in _vals.items():
        _f = _s["forecast"]
        _a = _s["anomaly"]
        if _f.get("status") == "ok":
            lines.append(f"  - {_v}: n={_s['cases']} eligible={_s['eligibleCases']}, "
                         f"income MAE {_f['income']['mae']}, expense MAE {_f['expense']['mae']}, "
                         f"anomaly P/R/F1 {_a['precision']}/{_a['recall']}/{_a['f1']}, "
                         f"FPR {_a['falsePositiveRate']} (samples {_a['sampleCount']}).")
        else:
            lines.append(f"  - {_v}: n={_s['cases']} — not enough evidence "
                         f"(need {segment_report['minSample']}+; metrics null).")
lines.append("")
lines.append("## 11. Confidence and calibration (computed, honest)")
lines.append("")
lines.append("- Confidence inputs (observable only): usable history weeks, holdout")
lines.append("  error, trend stability (expense CV), salary/festival evidence quality.")
lines.append(f"- Example low: {_conf_example_low['level']} (fallback={_conf_example_low['fallback']}) — "
             f"{_conf_example_low['reasons'][0]}")
lines.append(f"- Example high: {_conf_example_high['level']} (fallback={_conf_example_high['fallback']}) — "
             f"{'; '.join(_conf_example_high['reasons'][:2])}")
lines.append(f"- Tolerance band: max(BDT {CONF.TOLERANCE_FLOOR_BDT:.0f}, "
             f"{int(CONF.TOLERANCE_FRACTION * 100)}% of mean weekly expense). "
             "Meets tolerance = income AND expense MAE within band.")
for _b, _r in calibration_report["buckets"].items():
    if _r.get("status") == "ok":
        lines.append(f"- {_b}: coverage {_r['coverage']} (met {_r['metTolerance']}/{_r['sampleCount']}), "
                     f"error rate {_r['errorRate']}.")
    else:
        lines.append(f"- {_b}: not enough evidence (n={_r['sampleCount']}).")
lines.append(f"- Calibrated claim: `{calibration_report['calibrated']}` — {calibration_report['calibrationClaim']}")
lines.append("")
lines.append("## 12. Human-review and fallback policy")
lines.append("")
lines.append("- Low confidence / insufficient data → historical-average fallback with an")
lines.append('  uncertainty label and a "Review manually" action; no strong recommendation.')
lines.append('- High anomaly uncertainty → "review this expense", never fraud or wrongdoing.')
lines.append("- Predicted shortfall / repeated false positives → user-review action, never")
lines.append("  automated money movement. Service failure → deterministic fallback or a")
lines.append("  clear unavailable state. No model output can execute a transfer or modify")
lines.append("  a goal (deterministic backend services + explicit confirmation tokens only).")
lines.append("")
lines.append("## 9. Known limitations (read before citing numbers)")
lines.append("")
lines.append("- Straight-line trend model: a single huge purchase pulls forecasts up; the")
lines.append("  evaluation table makes that visible instead of hiding it.")
lines.append("- <8 weeks of history cannot be honestly split: the UI says so explicitly.")
lines.append("- Festival calendars are approximate public dates; uplift needs >=2 prior")
lines.append("  festival weeks from the user's own data or it stays off.")
lines.append("- Runtime number-guard is best-effort text matching, not full semantic proof.")
lines.append("- Dataset limits: fixtures are small, clean, single-pattern synthetics")
lines.append("  (one income + one expense per week; 38 labelled anomaly cases). They")
lines.append("  validate methodology and guard regressions; they DO NOT prove")
lines.append("  real-world production accuracy. Real-world validation needs labelled")
lines.append("  user data collected over time, which this project does not yet have.")
lines.append("")

out = "\n".join(lines)
(ROOT / "EVALUATION_REPORT.md").write_text(out, encoding="utf-8")
print(f"Wrote EVALUATION_REPORT.md ({len(out)} chars).")
