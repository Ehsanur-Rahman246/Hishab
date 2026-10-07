# Hishab — Evaluation Report (deterministic fixtures)

Generated: 2026-10-07 by `ai-service/tests/generate_eval_report.py`.
Every number below was computed by that script from fixed synthetic
fixtures — no live data, no invented benchmarks.

## 1. Temporal train/test methodology

- Expanding-window temporal split; weekly buckets are never shuffled.
- Final holdout: last 4 weeks, untouched during training.
- Production forecasts train on ALL history before the horizon; evaluation
  retrains on the truncated training period only (no leakage).
- Metrics per series (income, expense): MAE (BDT), RMSE (BDT), sMAPE (%) with
  0/0 weeks defined as 0. sMAPE is used instead of MAPE because MAPE divides
  by actuals and explodes on zero-actual weeks.
- Eligibility: >= 8 weekly buckets (4 train + 4 test). Ties go to the simpler
  historical-average baseline.

## 2. Fixture results (actual computed values)

### Fixture A — trending expenses (LinearRegression should win)

- History: 12 weeks starting 2026-05-04; income BDT 20000 flat,
  expense BDT 500 rising by BDT 200/week to BDT 2700.
- Train ends 2026-06-22; test 2026-06-29 to 2026-07-20.
- Winner: `linear_regression`.

| model | MAE | RMSE | sMAPE |
| ----- | --- | ---- | ----- |
| linear_regression income | 0.0 | 0.0 | 0.0% |
| linear_regression expense | 0.0 | 0.0 | 0.0% |
| historical_average income | 0.0 | 0.0 | 0.0% |
| historical_average expense | 1200.0 | 1220.6556 | 66.149% |

### Fixture B — flat series (baseline should win or tie)

- History: 8 weeks starting 2026-05-04; income BDT 10000, expense BDT 2000 flat.
- Train ends 2026-05-25; test 2026-06-01 to 2026-06-22.
- Winner: `historical_average_baseline`.

| model | MAE | RMSE | sMAPE |
| ----- | --- | ---- | ----- |
| linear_regression income | 0.0 | 0.0 | 0.0% |
| linear_regression expense | 0.0 | 0.0 | 0.0% |
| historicalAverage income | 0.0 | 0.0 | 0.0% |
| historicalAverage expense | 0.0 | 0.0 | 0.0% |

### Fixture C — insufficient history (honest ineligible)

- History: 3 weeks starting 2026-09-28.
- eligible: `False`; winner: `insufficient_data`.
- reason: "Not enough history for an honest train/test split: have 3 weekly buckets, need at least 8 (4 training + 4 holdout)." (no metrics emitted).

## 3. Salary + festival signals (computed)

- Salary fixture (BDT 30000 on the 28th x5 months, Asia/Dhaka): detected=`True`, payday day `28`, evidence `5`, typical BDT 30000.0.
- Thin history (<3 receipts): `salaryPatternDetected: false` (tested).
- Festival fixture (custom 3-window calendar, 2 prior festival weeks at 3x spend): applied=`True`, evidence weeks=`2`, income x1.0, expense x3.0. Income uplift stays ~1.0 — no hard-coded bonus is ever claimed.
- No-evidence case: `festivalAdjustmentApplied: false` with an explanatory reason string (tested).

## 4. Contextual anomaly detection (computed)

- Recurring BDT 15000 rent x5 + small food/transport: rent flagged? `False` (must be false).
- BDT 5000 Food outlier vs ~BDT 300 norm: flagged? `True` with reasons `['Amount is 16.7x above your normal Food spending', 'This merchant description has not appeared before', 'Recent 7-day spending is running well above your usual pace']`.
- Novel merchant + abnormal category, sparse-data fallback, and income-only
  no-crash paths are covered in `tests/test_anomalies_context.py` (16 checks).

## 5. Bangla/Banglish numerical grounding (backend)

- Suite: `backend/tests/coachNumericalGrounding.test.js` — 22 version-controlled
  cases (income/expense/net, percentages, categories, forecast + risk, goal
  progress/remaining, BDT/৳/comma formats, rounding edges, Bengali digits ১২৫০,
  Banglish phrasing, refusal-to-invent).
- Result pattern: 21 honest fixture replies pass; 1 adversarial reply with an
  invented amount is correctly rejected by the scorer (unsupported-claim works).
- Scorer: `backend/src/services/coachNumericalScorer.js` (Bengali-digit
  normalisation, BDT 1.0 absolute / 0.5% relative tolerance, language routing).
- Runtime: `applyNumericGroundingGuard` appends an explicit caution to the
  disclaimer when a live reply contains unverifiable figures (never silent).
- Live Groq probe is opt-in only: `node scripts/eval-coach-grounding.mjs --live`
  with GROQ_API_KEY/GROQ_MODEL; CI never calls the network.

## 6. Leakage-safe benchmark (`forecastEvaluation`, computed)

- Strategy `expanding_window_temporal_holdout`: raw transactions are split
  at the first holdout Monday (train dates strictly < cutoff <= test dates).
  Trend fit, historical-average baseline, salary search, and festival
  estimation each receive ONLY the training slice; holdout transactions
  supply scoring targets and nothing else. Spy tests in
  `tests/test_forecast_validation.py` record every fitting/feature input
  and assert no holdout date enters them.
- Trend fixture: train 2026-05-04..2026-06-22, test 2026-06-29..2026-07-20 (latest 4 weeks, untouched).
- Per-series winners: `{'income': 'tie', 'expense': 'linear_regression'}` (flat income ties at MAE 0; rising expenses won by LinearRegression).

| model series | MAE (BDT) | RMSE (BDT) |
| ------------ | --------- | ---------- |
| linearRegression income | 0.0 | 0.0 |
| linearRegression expense | 0.0 | 0.0 |
| historicalAverageBaseline income | 0.0 | 0.0 |
| historicalAverageBaseline expense | 1200.0 | 1220.6556 |

- Flat fixture winners: `{'income': 'tie', 'expense': 'tie'}` (stationary data ties).
- Short fixture (3 weeks): eligible=`False`, metrics null, reason: "Not enough history for an honest train/test split: have 3 weekly buckets, need at least 8 (4 training + 4 holdout).".
- Rolling-origin on the trend fixture: 5 expanding cutoffs; final cutoff identical to the holdout above; earlier cutoffs are
  validation folds only (no model selection or tuning uses the holdout).
  Mean LR expense MAE across cutoffs: 0.0 BDT; mean baseline expense MAE: 1000.0 BDT.

## 7. Labelled anomaly benchmark (`anomalyEvaluation`, computed)

- Dataset `synthetic_labelled_cases_v1`: 38 cases, 4 independently labelled anomalies (labels fixed by construction rules before any detector ran).
- Production detector: TP=4, FP=0, FN=0, precision=1.0, recall=1.0, f1=1.0.
- Precision = flagged-correct / all-flagged; recall = flagged-correct /
  all-known; F1 = harmonic mean. Recurring BDT 15000 rent (consistent
  with its own history) is not flagged for amount alone.
- Labels (`isKnownAnomaly`, `caseId`, `labelReason`) exist only in the
  test fixture and never appear in production API responses (asserted).

## 8. How to reproduce

```powershell
cd D:/Projects/Hishab/ai-service
.\.venv\Scripts\python.exe tests/test_ml_service.py           # 23 checks (existing)
.\.venv\Scripts\python.exe tests/test_evaluation.py           # 28 checks (temporal eval)
.\.venv\Scripts\python.exe tests/test_forecast_validation.py  # 45 checks (leakage-safe benchmark)
.\.venv\Scripts\python.exe tests/test_anomaly_validation.py   # 25 checks (labelled PRF)
.\.venv\Scripts\python.exe tests/test_patterns.py             # 18 checks (salary/festival)
.\.venv\Scripts\python.exe tests/test_anomalies_context.py    # 16 checks (anomalies)
.\.venv\Scripts\python.exe tests/test_segments.py             # 24 checks (segments/confidence/calibration)
.\.venv\Scripts\python.exe tests/generate_eval_report.py      # regenerates this file
```

```powershell
cd D:/Projects/Hishab/backend
npm test   # confirm-first goal suites + injection/hardening/CSRF/retention/privacy (88 total)
```

## 10. Segment-level validation (usage-pattern consistency, computed)

- Methodology: performance consistency across NON-SENSITIVE usage-pattern
  segments only (history length, income regularity, spending pattern,
  transaction density). NOT demographic fairness: Hishab does not collect
  protected attributes and never infers them (see `ai-service/segments.py`).
- Panel: 12 synthetic users; eligible 8, ineligible 4 (fallback rate 0.3333).
- Minimum sample per segment value: 4 — smaller groups report
  "insufficient_evidence" with null metrics (display "not enough evidence").
- history_length:
  - 16+ weeks: n=4 eligible=4, income MAE 9375.0, expense MAE 6768.3823, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 4).
  - 4-7 weeks: n=4 — not enough evidence (need 4+; metrics null).
  - 8-15 weeks: n=4 eligible=4, income MAE 5952.3809, expense MAE 0.0, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 4).
- income_regularity:
  - irregular: n=6 eligible=4, income MAE 12827.3809, expense MAE 3384.1912, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 6).
  - recurring: n=6 eligible=4, income MAE 2500.0, expense MAE 3384.1912, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 6).
- spending_pattern:
  - stable: n=10 eligible=8, income MAE 7663.6905, expense MAE 3384.1912, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 10).
  - volatile: n=2 — not enough evidence (need 4+; metrics null).
- transaction_density:
  - high: n=4 eligible=4, income MAE 9375.0, expense MAE 6768.3823, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 4).
  - low: n=4 — not enough evidence (need 4+; metrics null).
  - medium: n=4 eligible=4, income MAE 5952.3809, expense MAE 0.0, anomaly P/R/F1 1.0/1.0/1.0, FPR 0.0 (samples 4).

## 11. Confidence and calibration (computed, honest)

- Confidence inputs (observable only): usable history weeks, holdout
  error, trend stability (expense CV), salary/festival evidence quality.
- Example low: low (fallback=True) — Only 3 weeks of history (need 4+ for a trend; 8+ for evaluation).
- Example high: high (fallback=False) — 20 weeks of history (16+).; Spending is stable (CV 0.10 < 0.50).
- Tolerance band: max(BDT 500, 20% of mean weekly expense). Meets tolerance = income AND expense MAE within band.
- high: coverage 1.0 (met 4/4), error rate 0.0.
- medium: coverage 0.25 (met 2/8), error rate 0.75.
- low: coverage 0.0 (met 0/4), error rate 1.0.
- Calibrated claim: `True` — High-confidence forecasts met tolerance more often than medium, which beat low.

## 12. Human-review and fallback policy

- Low confidence / insufficient data → historical-average fallback with an
  uncertainty label and a "Review manually" action; no strong recommendation.
- High anomaly uncertainty → "review this expense", never fraud or wrongdoing.
- Predicted shortfall / repeated false positives → user-review action, never
  automated money movement. Service failure → deterministic fallback or a
  clear unavailable state. No model output can execute a transfer or modify
  a goal (deterministic backend services + explicit confirmation tokens only).

## 9. Known limitations (read before citing numbers)

- Straight-line trend model: a single huge purchase pulls forecasts up; the
  evaluation table makes that visible instead of hiding it.
- <8 weeks of history cannot be honestly split: the UI says so explicitly.
- Festival calendars are approximate public dates; uplift needs >=2 prior
  festival weeks from the user's own data or it stays off.
- Runtime number-guard is best-effort text matching, not full semantic proof.
- Dataset limits: fixtures are small, clean, single-pattern synthetics
  (one income + one expense per week; 38 labelled anomaly cases). They
  validate methodology and guard regressions; they DO NOT prove
  real-world production accuracy. Real-world validation needs labelled
  user data collected over time, which this project does not yet have.
