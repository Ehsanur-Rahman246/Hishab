# Product Outcome Report — Hishab Shortfall Prevention

## 1. Primary outcome (single prioritized measurable outcome)

> **Reduce the rate of user-months with a cash-flow shortfall.**

**Exact baseline metric definition (verbatim everywhere):**
Historical cash-flow shortfall month = a completed calendar month where total
recorded expenses exceed total recorded income. Call this "cash-flow
shortfall", not "negative wallet balance", unless a verified month-start
wallet balance and full wallet ledger make actual balance reconstruction
possible. A forecasted shortfall = projected four-week expenses exceed
projected four-week income, or the existing cumulative predicted balance
becomes negative when a reliable current wallet balance is available.

- Service: `backend/src/services/shortfallService.js`
  (`SHORTFALL_DEFINITION`, `computeShortfallBaseline`, `deriveForecastRisk`,
  `buildPreventionPlan`, `computePrePost`, `aggregateFeedback`).
- API: `GET /api/shortfall/outcome` returns
  `{ primaryOutcome, definition, baseline, currentPeriod, intervention,
  outcomeStatus }` with
  `outcomeStatus: baseline_only | tracking | insufficient_history`.
- UI: "Your shortfall prevention progress" card (Dashboard + Forecast +
  AI Assistant) shows the definition line on every render.

## 2. Baseline methodology

- Source: the user's own `Transaction` rows only (`type/category/amount/date`).
- Only **completed calendar months** count. Months are keyed in UTC
  (`YYYY-MM`); any transaction dated on/after the 1st of the current month
  is excluded from the baseline (partial-month exclusion, tested).
- `observedMonths` = distinct completed months containing ≥1 transaction.
- `shortfallMonths` = observed months with `expense > income`.
- `shortfallRate = shortfallMonths / observedMonths` (rounded to 3 decimals).
- `averageDeficitBDT` = mean (`expense − income`) over shortfall months.
- `topContributingCategories` = top-3 expense categories within shortfall
  months (amount + share). Weekly stats: Monday-start UTC weeks,
  `weeksNegativePct` = weeks with `expense > income` / weeks observed.
- Minimum history: `MIN_OBSERVED_MONTHS = 3`. Below that the API + UI return
  `insufficient_history` with the reason and required count.
- Strictly distinguished: (a) observed historical baseline, (b) forecasted
  upcoming risk, (c) post-intervention outcome tracking. Forecasts and
  advice alone never count as impact.
- Storage: `ShortfallPreventionMetric` holds counts + aggregate BDT only.
  `ShortfallEvent` holds intervention counts. No raw transaction copies.

## 3. Synthetic demo baseline (clearly labelled synthetic)

Deterministic fixture: `syntheticDemoTransactions()` builds Jan–Jun 2026,
income ৳20,000/month, alternating spend ৳21,450 (shortfall) / ৳18,500
(surplus). Evaluated at 2026-07-15 (June completed, July excluded):

| Item | Synthetic value |
| ---- | --------------- |
| observedMonths | 6 |
| shortfallMonths | 3 |
| shortfallRate | 0.5 |
| averageDeficitBDT | 1450 |
| topContributingCategories | Food / Shopping / Transport (shares from fixture) |
| Label | **Synthetic demo evidence — not real-user impact** |

Real-user metrics: **empty / pending** — no consented study data exists.
The outcome API returns `isSynthetic: false` for real users and never
invents impact. Aggregate impact requires `MIN_USERS_FOR_AGGREGATE = 10`
users with accepted plans and `MIN_MONTHS_PER_ARM_FOR_AGGREGATE = 2`
completed months per arm, else "Insufficient evidence to estimate impact."

## 4. Intervention funnel (privacy-safe events only)

`ShortfallEvent.kind`: `plan_shown → plan_accepted / plan_dismissed →
action_completed → feedback_useful / feedback_not_useful`, plus `language`,
advisory `actionRecommended` (never moves money), optional `reason`,
`featureHelpful` (forecast / expense_explanation / language_wording /
suggested_action / none). Feedback requires explicit consent
(`POST /api/shortfall/feedback` rejects `consent !== true`).

Current funnel (real users): **pending — no consented data yet.**
Pre/post comparison: completed months before `firstAcceptedPlanAt` vs after;
labelled "Observational before/after tracking — not proof of causality."

## 5. Research status

- Protocol: `docs/USER_RESEARCH_PROTOCOL.md` (target 8–12 MFS users).
- Guide: `docs/INTERVIEW_GUIDE_BN_EN.md` (neutral, non-leading).
- Consent: `docs/RESEARCH_CONSENT.md`.
- Results: `docs/USER_RESEARCH_RESULTS_TEMPLATE.md` — **empty**.
- **User interviews pending — no qualitative claims are made yet.**

## 6. Feedback priority results

- In-app report: `GET /api/shortfall/feedback-report` → `totalFeedbackResponses`,
  `usefulRateByFeature`, `mostUsefulFeature`, `languagePreference`.
- Minimum `MIN_FEEDBACK_FOR_REPORT = 5`; below that the API + UI return
  `insufficient_feedback` and refuse to rank. Small samples are never used
  to overstate preference.
- Current state: **pending / insufficient feedback.**

## 7. Coach prioritization

1. Predicted cash-flow shortfall + one verified driver.
2. One actionable expense/timing suggestion.
3. Optional savings-goal action only if it does not worsen predicted shortfall.
Enforced in `groqCoachService.js` system instruction + `ShortfallPlanCard`
rendered first in Forecast and AI Assistant. Zakat stays a separate utility;
anomaly detection is supportive (unusual expense → possible shortfall
contributor). The plan is advisory only — the LLM never moves money.

## 8. Limitations and next research steps

- Transaction-derived baseline reflects *recorded* cash flow, not verified
  wallet balances. Users with off-app income/spending will be mismeasured.
- UTC month bucketing may differ from a user's salary cycle by ±days.
- Thin history → cautious "Review your spending manually" state (by design).
- No causal inference: before/after tracking is observational; a controlled
  study is needed for causal claims.
- Next: run 8–12 interviews, ship consented longitudinal tracking, re-check
  aggregate gates, calibrate forecast confidence on real holdouts.
