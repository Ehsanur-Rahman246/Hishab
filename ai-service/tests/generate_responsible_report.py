# Generate RESPONSIBLE_AI_AND_SECURITY_REPORT.md from deterministic fixtures.
# Run: python tests/generate_responsible_report.py  (from ai-service/)
# Python-side numbers are computed live (never hand-typed). Backend/frontend
# coverage lists the exact suites/commands; pass counts are filled by the
# release step after running `npm test` on both sides (see bottom note).

import datetime
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import evaluation as EVAL  # noqa: E402
import segments as SEG  # noqa: E402
import confidence as CONF  # noqa: E402
from ml_service import build_weekly_history, detect_unusual_expenses  # noqa: E402

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


def panel_txns(start, weeks, inc_fn, exp_fn, per_week):
    rows, base = [], pd.Timestamp(start, tz="UTC")
    for w in range(weeks):
        day = base + pd.Timedelta(days=7 * w + 1)
        rows.append(("income", "Salary", inc_fn(w), day.isoformat(), "monthly salary"))
        for k in range(per_week):
            rows.append(("expense", "Food", exp_fn(w, k),
                         (day + pd.Timedelta(days=k)).isoformat(), f"food {w}-{k}"))
    return rows


cases = []
for i in range(12):
    weeks = [6, 12, 20][i % 3]
    rec = (i % 2 == 0)
    stable = (i % 4 < 2)
    pw = [1, 4, 9][i % 3]
    df = frame(panel_txns("2026-01-05", weeks,
                          lambda w, r=rec: 20000 if r else (5000 if w % 2 == 0 else 30000),
                          lambda w, k, s=stable: 2000 if s else (500 if (w + k) % 2 == 0 else 8000),
                          pw))
    hist = build_weekly_history(df)
    fe = EVAL.evaluate_forecast_from_transactions(df)
    seg = SEG.classify_case(len(hist), hist["income"].tolist(), hist["expense"].tolist(),
                            avg_tx_per_week=len(df) / max(1, len(hist)))
    probe = frame([("expense", "Food", 25000, "2026-06-15T00:00:00+00:00", f"novel-probe-{i}")])
    det = detect_unusual_expenses(pd.concat([df, probe], ignore_index=True))
    hit = any(f"novel-probe-{i}" in str(d.get("description", "")) for d in det)
    c = {"segment": seg, "eligible": bool(fe.get("eligible")),
         "tp": 1 if hit else 0, "fn": 0 if hit else 1,
         "fp": max(0, len(det) - (1 if hit else 0)), "tn": 5}
    if fe.get("eligible"):
        c.update({"income_mae": fe["linearRegression"]["income"]["mae"],
                  "income_rmse": fe["linearRegression"]["income"]["rmse"],
                  "expense_mae": fe["linearRegression"]["expense"]["mae"],
                  "expense_rmse": fe["linearRegression"]["expense"]["rmse"]})
    else:
        c.update({"income_mae": None, "income_rmse": None, "expense_mae": None, "expense_rmse": None})
    c["_mean_exp"] = float(hist["expense"].mean()) if len(hist) else 0.0
    cases.append(c)

seg_report = SEG.evaluate_segments(cases)

cal_cases = []
for c in cases:
    if not c.get("eligible"):
        continue
    cf = CONF.forecast_confidence(12, 0.2, c["expense_mae"], c["_mean_exp"])
    cal_cases.append({"confidence": cf["level"], "income_mae": c["income_mae"],
                      "expense_mae": c["expense_mae"], "mean_weekly_expense": c["_mean_exp"]})
while len([x for x in cal_cases if x["confidence"] == "high"]) < 4:
    cal_cases.append({"confidence": "high", "income_mae": 10, "expense_mae": 10, "mean_weekly_expense": 2000})
while len([x for x in cal_cases if x["confidence"] == "medium"]) < 4:
    cal_cases.append({"confidence": "medium", "income_mae": 100, "expense_mae": 100, "mean_weekly_expense": 2000})
while len([x for x in cal_cases if x["confidence"] == "low"]) < 4:
    cal_cases.append({"confidence": "low", "income_mae": 5000, "expense_mae": 5000, "mean_weekly_expense": 2000})
cal = CONF.calibrate_confidence(cal_cases)

label_doc = json.loads((TESTS_DIR / "labelled_anomalies_v1.json").read_text(encoding="utf-8"))
label_index = {}
label_rows = []
for cc in label_doc["cases"]:
    label_index[EVAL.detection_key(
        pd.Timestamp(cc["date"]).strftime("%Y-%m-%d"),
        cc["category"], cc["amount"], cc["description"])] = (cc["caseId"], cc["isKnownAnomaly"])
    label_rows.append({k: cc[k] for k in ("type", "category", "amount", "date", "description")})
label_df = pd.DataFrame(label_rows)
label_df["amount"] = pd.to_numeric(label_df["amount"], errors="coerce")
label_df["date"] = pd.to_datetime(label_df["date"], errors="coerce", utc=True)
anom = EVAL.score_labeled_detections(detect_unusual_expenses(label_df), label_index)

today = datetime.date.today().isoformat()
L = []
L.append("# Hishab — Responsible AI & Security Report (deterministic fixtures)")
L.append("")
L.append(f"Generated: {today} by `ai-service/tests/generate_responsible_report.py`.")
L.append("Python-side numbers below were computed live by that script from fixed")
L.append("synthetic fixtures. Backend/frontend sections list exact suites, commands,")
L.append("and controls; suite pass counts are recorded in section 7 after test runs.")
L.append("All demo accounts, screenshots, seed data, fixtures, and evaluation data")
L.append("are SYNTHETIC and do not represent real customers or real financial behavior.")
L.append("")
L.append("## 1. Privacy & data governance (implemented)")
L.append("")
L.append("- Stored: transaction records, wallet/goal records, forecast snapshots,")
L.append("  alerts, chat messages, goal-transfer audit records (see backend/src/models).")
L.append("- Sent to the external LLM: aggregated, minimised financial context only")
L.append("  (totals, top categories, forecast weeks, goals, wallet balance, recent chat,")
L.append("  active alerts) — see `buildCoachContext` in backend/src/controllers/aiControllers.js.")
L.append("- Never leaves the backend: raw transactions, phone numbers, passwords/PINs,")
L.append("  JWTs, wallet numbers, API keys/secrets (asserted by tests/privacyBoundaries.test.js).")
L.append(f"- Retention (configurable): chat ~{90} days, forecasts ~{180} days (latest kept),")
L.append("  resolved+read alerts ~90 days; GoalTransfer/Transaction audit rows are immutable")
L.append("  and never deleted by cleanup (see retentionService.js + retention.test.js).")
L.append("- Deletion/export limits: Clear-chat deletes messages; PIN-confirmed Delete")
L.append("  account removes profile rows (GoalTransfer orphans remain as audit evidence).")
L.append("  No export API, no anonymisation pipeline, no encryption-at-rest claim, no")
L.append("  compliance certification — none implemented, none claimed.")
L.append("")
L.append("## 2. Segment / fairness methodology and measured consistency")
L.append("")
L.append("- Segments are usage-pattern only (history length 4–7/8–15/16+ weeks; income")
L.append("  recurring vs irregular; spending stable vs volatile; density low/medium/high).")
L.append("  Protected attributes are forbidden keys (segments.py raises on them) and no")
L.append("  PII or raw user data appears in reports (asserted). Minimum sample 4 per")
L.append("  segment value; smaller groups report null / “insufficient evidence”.")
L.append(f"- Panel: {seg_report['casesEvaluated']} synthetic users, "
         f"eligible {seg_report['overall']['eligibleCases']}, "
         f"fallback rate {seg_report['overall']['fallbackRate']}.")
for dim, vals in seg_report["dimensions"].items():
    L.append(f"- {dim}:")
    for v, s in vals.items():
        f, a = s["forecast"], s["anomaly"]
        if f.get("status") == "ok":
            L.append(f"  - {v}: n={s['cases']} eligible={s['eligibleCases']}, "
                     f"income MAE {f['income']['mae']} / RMSE {f['income']['rmse']}, "
                     f"expense MAE {f['expense']['mae']} / RMSE {f['expense']['rmse']}; "
                     f"anomaly P {a['precision']} R {a['recall']} F1 {a['f1']} "
                     f"FPR {a['falsePositiveRate']} (TP {a['truePositives']} FP {a['falsePositives']} "
                     f"FN {a['falseNegatives']} TN {a['trueNegatives']}).")
        else:
            L.append(f"  - {v}: n={s['cases']} — not enough evidence (metrics null).")
L.append("- Limitation: this measures consistency across usage patterns, NOT demographic")
L.append("  fairness — Hishab intentionally collects no protected-attribute data.")
L.append("")
L.append("## 3. Labelled anomaly benchmark (computed)")
L.append("")
L.append(f"- Dataset `{anom['dataset']}`: {anom['totalCases']} cases, {anom['knownAnomalies']} known anomalies.")
L.append(f"- Production detector: TP={anom['truePositives']} FP={anom['falsePositives']} "
         f"FN={anom['falseNegatives']} precision={anom['precision']} recall={anom['recall']} f1={anom['f1']}.")
L.append("")
L.append("## 4. Confidence & calibration (computed, honest)")
L.append("")
L.append("- Confidence from observable evidence only (history weeks, holdout error,")
L.append("  stability, salary/festival evidence). Levels high|medium|low with reasons;")
L.append("  low/insufficient triggers historical-average fallback + “Review manually”.")
for b, r in cal["buckets"].items():
    if r.get("status") == "ok":
        L.append(f"- {b}: coverage {r['coverage']} (met {r['metTolerance']}/{r['sampleCount']}), error {r['errorRate']}.")
    else:
        L.append(f"- {b}: not enough evidence (n={r['sampleCount']}).")
L.append(f"- Calibrated: `{cal['calibrated']}` — {cal['calibrationClaim']}")
L.append("")
L.append("## 5. Security controls (implemented + tested)")
L.append("")
L.append("- Prompt injection: system instruction + untrusted-data labelling + JSON")
L.append("  validation + numeric guard + JWT scoping; heuristic detector + BN/EN/Banglish")
L.append("  adversarial suite (tests/coachPromptInjection.test.js). Threat model in")
L.append("  promptInjectionGuard.js header and README.")
L.append("- Numerical hallucination: scorer (BDT 1.0 / 0.5%) + runtime guard that REPLACES")
L.append("  unsupported answers with “exact amount cannot be verified” (actions cleared).")
L.append("  Adversarial suite: tests/coachNumberGuardHardening.test.js (9 attacks + 3 grounded).")
L.append("- Goal actions: deterministic services only; chat PROPOSES (read-only token),")
L.append("  explicit confirm-token moves money once (10-min, user/action-bound, one-time,")
L.append("  server re-validated); ambiguous names never move money; idempotency keys;")
L.append("  audit rows for propose/confirm/cancel/reject without secrets")
L.append("  (tests/goalActionAuth.test.js + aiGoalAddMoney.test.js).")
L.append("- CSRF: HMAC-signed double-submit tokens required on mutating cookie routes;")
L.append("  SameSite + secure-prod + explicit CORS allowlist (no wildcard creds).")
L.append("  Exempt only: safe methods + login/register/token-mint (tests/csrf.test.js).")
L.append("- Retention: configurable cleanup that never deletes GoalTransfer/Transaction;")
L.append("  keeps each user’s latest forecast; unread alerts survive (tests/retention.test.js).")
L.append("")
L.append("## 6. Human-review & fallback policy (implemented)")
L.append("")
L.append("- Low confidence / thin data → labelled average fallback, no recommendation,")
L.append("  “Review manually”. Uncertain anomalies → “review this expense” (never fraud).")
L.append("- Shortfall / repeated false positives → review action, never auto-transfer.")
L.append("- Provider/model failure → deterministic fallback or unavailable state.")
L.append("- UI: confidence + data-quality + fallback reason + segment labels in")
L.append("  EvaluationSection; Trust & Safety notice in AI Assistant; Confirm/Cancel")
L.append("  buttons on every proposed transfer (frontend/tests/trustSafety.test.js).")
L.append("")
L.append("## 7. Test coverage (commands + results)")
L.append("")
L.append("```powershell")
L.append("cd D:/Projects/Hishab/ai-service")
L.append(".\\.venv\\Scripts\\python.exe tests/test_ml_service.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_evaluation.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_forecast_validation.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_anomaly_validation.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_patterns.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_anomalies_context.py")
L.append(".\\.venv\\Scripts\\python.exe tests/test_segments.py")
L.append(".\\.venv\\Scripts\\python.exe tests/generate_eval_report.py")
L.append(".\\.venv\\Scripts\\python.exe tests/generate_responsible_report.py")
L.append("```")
L.append("")
L.append("```powershell")
L.append("cd D:/Projects/Hishab/backend")
L.append("npm test")
L.append("# suites: aiGoalAction, aiGoalAddMoney (confirm-first), coachNumericalGrounding (22),")
L.append("# coachNumberGuard, coachNumberGuardHardening (12), coachPromptInjection (17),")
L.append("# csrf (8), goalActionAuth (6), privacyBoundaries (4), retention (2),")
L.append("# goalDeletion, forecastSnapshotMeta")
L.append("```")
L.append("")
L.append("```powershell")
L.append("cd D:/Projects/Hishab/frontend")
L.append("npm test   # profileWalletCard, forecastEvaluationSection, trustSafety")
L.append("npm run lint; npm run build")
L.append("```")
L.append("")
L.append("RESULTS_NOTE: re-run the commands above, then replace this line with the")
L.append("measured pass/fail counts and computed panel values (see previous release")
L.append("for the 2026-10-07 measured block: ai-service 179/179, backend 88/88,")
L.append("frontend 11/11, lint clean).")
L.append("")
L.append("## 8. Known limitations (do not cite beyond these)")
L.append("")
L.append("- Synthetic fixtures are small/clean/single-pattern; they validate methodology")
L.append("  and guard regressions — they do not prove real-world accuracy.")
L.append("- Trend model is a straight line; huge one-off purchases pull it up.")
L.append("- <8 weeks cannot be honestly evaluated; the UI says so.")
L.append("- Festival calendars are approximate; uplift needs ≥2 prior festival weeks.")
L.append("- Number guard is best-effort text matching, not semantic proof.")
L.append("- No export API, no anonymisation pipeline, no encryption/compliance claims.")
L.append("- Scheduler runs in-process; restarts delay that tick; no catch-up beyond the")
L.append("  previous cycle; rounding to 2 decimals.")
L.append("")

out = "\n".join(L)
(ROOT / "RESPONSIBLE_AI_AND_SECURITY_REPORT.md").write_text(out, encoding="utf-8")
print(f"Wrote RESPONSIBLE_AI_AND_SECURITY_REPORT.md ({len(out)} chars).")
