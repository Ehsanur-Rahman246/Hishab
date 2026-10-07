# Hishab — Responsible AI & Security Report (deterministic fixtures)

Generated: 2026-10-07 by `ai-service/tests/generate_responsible_report.py`.
Python-side numbers below were computed live by that script from fixed
synthetic fixtures. Backend/frontend sections list exact suites, commands,
and controls; suite pass counts are recorded in section 7 after test runs.
All demo accounts, screenshots, seed data, fixtures, and evaluation data
are SYNTHETIC and do not represent real customers or real financial behavior.

## 1. Privacy & data governance (implemented)

- Stored: transaction records, wallet/goal records, forecast snapshots,
  alerts, chat messages, goal-transfer audit records (see backend/src/models).
- Sent to the external LLM: aggregated, minimised financial context only
  (totals, top categories, forecast weeks, goals, wallet balance, recent chat,
  active alerts) — see `buildCoachContext` in backend/src/controllers/aiControllers.js.
- Never leaves the backend: raw transactions, phone numbers, passwords/PINs,
  JWTs, wallet numbers, API keys/secrets (asserted by tests/privacyBoundaries.test.js).
- Retention (configurable): chat ~90 days, forecasts ~180 days (latest kept),
  resolved+read alerts ~90 days; GoalTransfer/Transaction audit rows are immutable
  and never deleted by cleanup (see retentionService.js + retention.test.js).
- Deletion/export limits: Clear-chat deletes messages; PIN-confirmed Delete
  account removes profile rows (GoalTransfer orphans remain as audit evidence).
  No export API, no anonymisation pipeline, no encryption-at-rest claim, no
  compliance certification — none implemented, none claimed.

## 2. Segment / fairness methodology and measured consistency

- Segments are usage-pattern only (history length 4–7/8–15/16+ weeks; income
  recurring vs irregular; spending stable vs volatile; density low/medium/high).
  Protected attributes are forbidden keys (segments.py raises on them) and no
  PII or raw user data appears in reports (asserted). Minimum sample 4 per
  segment value; smaller groups report null / “insufficient evidence”.
- Panel: 12 synthetic users, eligible 8, fallback rate 0.3333.
- history_length:
  - 16+ weeks: n=4 eligible=4, income MAE 9375.0 / RMSE 11936.3611, expense MAE 6768.3823 / RMSE 9892.6114; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 4 FP 0 FN 0 TN 20).
  - 4-7 weeks: n=4 — not enough evidence (metrics null).
  - 8-15 weeks: n=4 eligible=4, income MAE 5952.3809 / RMSE 6967.0833, expense MAE 0.0 / RMSE 0.0; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 4 FP 0 FN 0 TN 20).
- income_regularity:
  - irregular: n=6 eligible=4, income MAE 12827.3809 / RMSE 13903.4444, expense MAE 3384.1912 / RMSE 4946.3057; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 6 FP 0 FN 0 TN 30).
  - recurring: n=6 eligible=4, income MAE 2500.0 / RMSE 5000.0, expense MAE 3384.1912 / RMSE 4946.3057; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 6 FP 0 FN 0 TN 30).
- spending_pattern:
  - stable: n=10 eligible=8, income MAE 7663.6905 / RMSE 9451.7222, expense MAE 3384.1912 / RMSE 4946.3057; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 10 FP 0 FN 0 TN 50).
  - volatile: n=2 — not enough evidence (metrics null).
- transaction_density:
  - high: n=4 eligible=4, income MAE 9375.0 / RMSE 11936.3611, expense MAE 6768.3823 / RMSE 9892.6114; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 4 FP 0 FN 0 TN 20).
  - low: n=4 — not enough evidence (metrics null).
  - medium: n=4 eligible=4, income MAE 5952.3809 / RMSE 6967.0833, expense MAE 0.0 / RMSE 0.0; anomaly P 1.0 R 1.0 F1 1.0 FPR 0.0 (TP 4 FP 0 FN 0 TN 20).
- Limitation: this measures consistency across usage patterns, NOT demographic
  fairness — Hishab intentionally collects no protected-attribute data.

## 3. Labelled anomaly benchmark (computed)

- Dataset `synthetic_labelled_cases_v1`: 38 cases, 4 known anomalies.
- Production detector: TP=4 FP=0 FN=0 precision=1.0 recall=1.0 f1=1.0.

## 4. Confidence & calibration (computed, honest)

- Confidence from observable evidence only (history weeks, holdout error,
  stability, salary/festival evidence). Levels high|medium|low with reasons;
  low/insufficient triggers historical-average fallback + “Review manually”.
- high: coverage 1.0 (met 4/4), error 0.0.
- medium: coverage 0.25 (met 2/8), error 0.75.
- low: coverage 0.0 (met 0/4), error 1.0.
- Calibrated: `True` — High-confidence forecasts met tolerance more often than medium, which beat low.

## 5. Security controls (implemented + tested)

- Prompt injection: system instruction + untrusted-data labelling + JSON
  validation + numeric guard + JWT scoping; heuristic detector + BN/EN/Banglish
  adversarial suite (tests/coachPromptInjection.test.js). Threat model in
  promptInjectionGuard.js header and README.
- Numerical hallucination: scorer (BDT 1.0 / 0.5%) + runtime guard that REPLACES
  unsupported answers with “exact amount cannot be verified” (actions cleared).
  Adversarial suite: tests/coachNumberGuardHardening.test.js (9 attacks + 3 grounded).
- Goal actions: deterministic services only; chat PROPOSES (read-only token),
  explicit confirm-token moves money once (10-min, user/action-bound, one-time,
  server re-validated); ambiguous names never move money; idempotency keys;
  audit rows for propose/confirm/cancel/reject without secrets
  (tests/goalActionAuth.test.js + aiGoalAddMoney.test.js).
- CSRF: HMAC-signed double-submit tokens required on mutating cookie routes;
  SameSite + secure-prod + explicit CORS allowlist (no wildcard creds).
  Exempt only: safe methods + login/register/token-mint (tests/csrf.test.js).
- Retention: configurable cleanup that never deletes GoalTransfer/Transaction;
  keeps each user’s latest forecast; unread alerts survive (tests/retention.test.js).

## 6. Human-review & fallback policy (implemented)

- Low confidence / thin data → labelled average fallback, no recommendation,
  “Review manually”. Uncertain anomalies → “review this expense” (never fraud).
- Shortfall / repeated false positives → review action, never auto-transfer.
- Provider/model failure → deterministic fallback or unavailable state.
- UI: confidence + data-quality + fallback reason + segment labels in
  EvaluationSection; Trust & Safety notice in AI Assistant; Confirm/Cancel
  buttons on every proposed transfer (frontend/tests/trustSafety.test.js).

## 7. Test coverage (commands + results)

```powershell
cd D:/Projects/Hishab/ai-service
.\.venv\Scripts\python.exe tests/test_ml_service.py
.\.venv\Scripts\python.exe tests/test_evaluation.py
.\.venv\Scripts\python.exe tests/test_forecast_validation.py
.\.venv\Scripts\python.exe tests/test_anomaly_validation.py
.\.venv\Scripts\python.exe tests/test_patterns.py
.\.venv\Scripts\python.exe tests/test_anomalies_context.py
.\.venv\Scripts\python.exe tests/test_segments.py
.\.venv\Scripts\python.exe tests/generate_eval_report.py
.\.venv\Scripts\python.exe tests/generate_responsible_report.py
```

```powershell
cd D:/Projects/Hishab/backend
npm test
# suites: aiGoalAction, aiGoalAddMoney (confirm-first), coachNumericalGrounding (22),
# coachNumberGuard, coachNumberGuardHardening (12), coachPromptInjection (17),
# csrf (8), goalActionAuth (6), privacyBoundaries (4), retention (2),
# goalDeletion, forecastSnapshotMeta
```

```powershell
cd D:/Projects/Hishab/frontend
npm test   # profileWalletCard, forecastEvaluationSection, trustSafety
npm run lint; npm run build
```

Measured 2026-10-07 (this release, commands above):
- ai-service: test_ml_service 23/23, test_evaluation 28/28,
  test_forecast_validation 45/45, test_anomaly_validation 25/25 (TP=4 FP=0 FN=0,
  precision/recall/F1=1.0 on 38 labelled cases), test_patterns 18/18,
  test_anomalies_context 16/16, test_segments 24/24 — total 179/179 passed, 0 failed.
- Segment panel (12 synthetic users): 8 eligible / 4 ineligible (fallback rate
  0.3333); per-segment income/expense MAE-RMSE + anomaly P/R/F1/FPR computed in
  §2; small groups report null / “not enough evidence” (min sample 4).
- Calibration buckets (padded to ≥4 samples each for honesty checking):
  coverage computed per bucket; calibrated flag computed live (see §4) — no
  “calibrated” claim unless high > medium > low strictly.
- Numerical hardening: 9 adversarial invented-figure replies replaced with
  “exact amount cannot be verified” (actions cleared); 3 grounded replies
  preserved; unsupported-claim rate on the 12-case panel = 9/12.
- backend `npm test`: 88/88 passed, 0 failed (13 suites incl. confirm-first
  add-money, goalActionAuth cross-user/token/audit, prompt-injection BN/EN/Banglish,
  number-guard replacement, CSRF valid/missing/invalid/cross-user/expired/exempt,
  retention immutable-ledger, privacy boundaries).
- frontend `npm test`: 11/11 passed; `npm run lint` clean (build not run here).

## 8. Known limitations (do not cite beyond these)

- Synthetic fixtures are small/clean/single-pattern; they validate methodology
  and guard regressions — they do not prove real-world accuracy.
- Trend model is a straight line; huge one-off purchases pull it up.
- <8 weeks cannot be honestly evaluated; the UI says so.
- Festival calendars are approximate; uplift needs ≥2 prior festival weeks.
- Number guard is best-effort text matching, not semantic proof.
- No export API, no anonymisation pipeline, no encryption/compliance claims.
- Scheduler runs in-process; restarts delay that tick; no catch-up beyond the
  previous cycle; rounding to 2 decimals.
