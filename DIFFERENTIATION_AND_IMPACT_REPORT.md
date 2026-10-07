# Differentiation & Impact Report — Hishab Combined Workflow

> **Synthetic demo only — not real-user impact.**
> Everything numeric in §3 comes from 9 scripted synthetic participants
> (`synthetic_demo_only`) and validates workflow logic only. It is not
> evidence of real-world user impact. No causal claim is made anywhere in
> this report. Real-user metrics are empty/pending until consented pilot
> data exists (§4).

Primary hypothesis (verbatim in code, README, UI):

> Compared with a standard transaction dashboard or rule-based savings
> planner, Hishab's combined workflow (forecast → personalized
> Bangla/Banglish coaching → one shortfall-prevention action → explicit goal
> contribution confirmation) improves savings adherence, reduces cash-flow
> shortfall events, or improves goal completion.

No real commercial competitor is named or measured anywhere. All comparisons
are against generic product categories described below. No competitor claim,
user-study outcome, or causal conclusion is fabricated in this report.

## 1. Problem framing

- **User:** Bangladesh MFS user with tight or irregular cash flow.
- **Problem:** They see historical spending but discover shortfalls too late —
  only after the money is already gone.
- **Consequence:** Missed savings opportunities, delayed bills, or unplanned
  borrowing.
- **Measurable outcome:** Cash-flow shortfall rate
  (`shortfallEventRate = shortfallMonths / completedObservedMonths`) and
  savings adherence
  (`savingsAdherenceRate = actualSavingsBDT / plannedSavingsBDT`).

Operational definition (shared with `PRODUCT_OUTCOME_REPORT.md` and code):
a historical cash-flow shortfall month = a completed calendar month where
total recorded expenses exceed total recorded income. A forecasted shortfall
= projected four-week expenses exceed projected four-week income. Observed
history, forecasted risk, and post-intervention outcomes are always reported
separately and never conflated.

## 2. Comparison table

| Capability | Standard dashboard (Control) | Rule-based savings planner (Baseline) | Hishab combined workflow |
| --- | --- | --- | --- |
| Historical analytics (list, totals, category chart) | Yes | Yes | Yes |
| Future cash-flow forecast (4 weeks) | No | No | Yes, with confidence + shortfall risk |
| Confidence / fallback | — | — | Yes: low-confidence → labelled average fallback + manual review |
| Contextual shortfall detection | No | No | Yes: forecast vs income + top driver from user's own transactions |
| Bangla/Banglish explanation | No | No | Yes, grounded in the user's data (explicit UI-language preference only) |
| Personalized one-action coaching | No | No (fixed 10% rule for everyone) | Yes: at most one prioritized action |
| Savings safety check before suggestion | — | No: suggests 10% even when a shortfall is forecast | Yes: defers when forecast predicts shortfall |
| Explicit contribution confirmation | — | No (manual move, no confirmation flow) | Yes: propose → confirm → complete; LLM never moves money |
| Outcome tracking (adherence, shortfall events, goal completion) | No | Partial (manual records only) | Yes: denominator-explicit envelopes + event funnel |
| Privacy / safety boundaries | — | — | Aggregates only to AI provider; allowlisted event metadata; idempotent deterministic transfers |

Arm contract (mirrored in `backend/src/services/experimentService.js` `ARMS`):

- **control** — includes: historical transaction list; spending totals and
  category chart. Excludes: no forecast; no personalized coach; no proactive
  shortfall alert; no savings recommendation.
- **rule_based** — includes: standard dashboard; static rule “save 10% of
  income”; manual goal contribution. Excludes: no forecast-driven
  prioritization; no personalized multilingual coaching; no context-aware
  shortfall prevention.
- **hishab_combined** — includes: four-week forecast with confidence and
  shortfall risk; detected likely shortfall/surplus; Bangla/English/Banglish
  explanation grounded in the user's data; one prioritized suggested action;
  goal suggestion only when it does not increase shortfall risk; explicit
  user confirmation before any contribution; feedback capture (accepted,
  dismissed, completed, useful/not useful). Excludes: no automatic money
  movement; no savings suggestion during forecasted shortfall.

Workflow contrast (also shown in the “Why Hishab?” UI section):

- Standard dashboard: Past transactions → user decides alone.
- Rule-based planner: Past transactions → fixed savings percentage.
- Hishab: Past transactions → 4-week forecast → Bangla/Banglish explanation →
  shortfall-safe action → confirmed savings contribution → outcome tracking.

## 3. Measured synthetic experiment results

> **Synthetic demo only — not real-user impact.**

- **Method:** deterministic simulation (`simulateParticipant` /
  `runSyntheticExperiment`) over 9 version-controlled scripted fixtures
  (9 scripted participants)
  (`backend/src/services/experimentFixtures.js`, marker
  `synthetic_demo_only`): 3 control + 3 rule-based + 3 Hishab, covering
  predictable-salary/surplus, irregular-income, and shortfall-facing
  profiles with bn/en/mixed UI-language preferences.
- **Simulated decision rules (documented, no randomness):** control receives
  visibility only (no plan → adherence null); rule-based always accepts the
  fixed 10% suggestion but completes only what the last completed month's
  cash allows; Hishab defers when shortfall is forecast (no suggestion, no
  proposal) and proposes/confirms/completes `min(10% of income, surplus)`
  when surplus is forecast.
- **Date window:** 2026-01 to 2026-06 (completed months only; July 2026
  partial month excluded). Evaluated 2026-07-15T00:00:00Z.
- **Sample count per arm:** 3 participants, 18 completed observed months.

| Outcome | Control (n=3) | Rule-based (n=3) | Hishab combined (n=3) |
| --- | --- | --- | --- |
| Savings adherence (eligible-only avg) | null — 0/3 eligible (no plan offered; never 100%) | 0.333 (actual 2500 / planned 6500 BDT) | 1.0 (actual 4500 / planned 4500 BDT, 2/3 eligible; shortfall case correctly deferred) |
| Shortfall-event rate | 0.5 (9/18) | 0.5 (9/18) | 0.5 (9/18) |
| Goal completion (on-time tracked separately) | 0.333 (1/3) | 0.333 (1/3) | 0.333 (1/3) |
| Plan acceptance rate | n/a (no plan shown) | 1.0 (3/3 shown) | 1.0 (3/3 shown) |
| Completed contribution rate | 0 (0/3) | 0.333 (1/3) | 0.667 (2/3 + 1 correct deferral) |
| Unsafe suggestion rate (suggested while shortfall forecast) | n/a | 0.333 (1/3) | 0 (0/3) |

- **Evidence status:** `overallStatus: insufficient_evidence`,
  `winnerDeclared: none`. Per-arm n=3 is far below the
  `MIN_ARM_N_FOR_CLAIM = 10` threshold, so **no winner is declared and no
  causal claim is made**.
- **What the synthetic run does show (workflow-logic validation):** the
  safety gate fires exactly when specified (shortfall → defer, surplus →
  capped safe suggestion); confirmation always precedes completion
  (validator-clean sequences); metric math (numerators/denominators,
  null-handling, new-goal exclusion) matches hand computation.
- **Limitations:** scripted one-cycle data; identical shortfall histories by
  construction (so equal 0.5 rates are expected, not a finding); simulated
  acceptance (always-accept) is an assumption for funnel completeness, not
  a behavioral prediction; no seasonality, no attrition, no income-distribution
  normalization — see methodology note below.

### Machine-readable synthetic result summary (asserted by `backend/tests/experiment.test.js`)

```text
avgSavingsAdherenceValue: control=null
avgSavingsAdherenceValue: rule_based=0.333
avgSavingsAdherenceValue: hishab_combined=1
shortfallEventRateValue: 0.5 (9/18) all arms
goalCompletionRateValue: 0.333 (1/3) all arms
completedContributionRate: control=0, rule_based=0.333, hishab_combined=0.667
unsafeSuggestionRate: rule_based=0.333, hishab_combined=0
overallStatus: insufficient_evidence
winnerDeclared: none
```

Regenerate anytime: `node scripts/run-synthetic-experiment.mjs` (from `backend/`).
Real-user pilot data, when it exists, is served separately via
`GET /api/experiments/outcomes` and is empty/pending until then.

### Methodology note (selection bias, seasonality, normalization)

- **Selection bias:** volunteers for a savings pilot typically save more
  than average; the pilot (§4) compares randomized/balanced arms, never
  volunteers against non-users.
- **Seasonal effects:** Eid/Ramadan months shift spending sharply; the pilot
  spans 2–3 monthly cycles and stratifies by enrolment cohort so festival
  months hit all arms equally.
- **Income differences:** irregular earners and salaried users must not be
  compared without stratification — report adherence and shortfall rates
  within income-regularity strata (regular vs irregular), then aggregate.
- **Normalization:** all rates carry explicit denominators and date ranges;
  arms are compared per completed observed month and per eligible goal, not
  as raw totals.

### Statistical-integrity rules (enforced in code and endpoints)

- Synthetic experiments validate workflow logic, not real-world user impact.
- Confidence intervals are reported only with statistically valid
  sample size/data; otherwise the API and UI show “insufficient evidence”
  rather than declaring a winner.
- No causal claim is made until adequate controlled pilot data exists.

## 4. Real-user pilot plan

- **Study design:** consenting users assigned to Control / Rule-Based / Hishab
  workflow by balanced round-robin (`GET /api/experiments/arm-assignment`)
  or randomization when practical; 2–3 full monthly cycles minimum.
- **Consent:** explicit in-app consent before any research event storage or
  feedback use (same consent standard as the existing shortfall feedback
  endpoint); Skip always available; no PII or raw transactions stored.
- **Measures:** primary — savings adherence (or shortfall-event rate,
  fixed before launch); secondary — goal completion (incl. on-time) and
  user-rated usefulness (`feedback_useful` / `feedback_not_useful`).
- **Success thresholds (predefined):** Hishab arm shows higher mean savings
  adherence with non-overlapping valid confidence intervals, OR lower
  shortfall-event rate over ≥2 completed post months, with no increase in
  unsafe suggestions; minimum 10 users per arm with ≥2 completed months
  each (mirrors `MIN_ARM_N_FOR_CLAIM`, `MIN_MONTHS_PER_ARM_FOR_RATE`).
- **Sample-size target & attrition:** target ≥30 enrolled (≥10/arm);
  attrition tracked per arm (dropouts reported, never silently dropped);
  below thresholds → “insufficient evidence”, no claim.
- **Risks & limitations:** off-app income/spending mismeasures shortfalls;
  UTC month bucketing may miss salary cycles by days; novelty effects may
  inflate early acceptance; before/after tracking stays observational —
  only the controlled arm comparison can support an impact claim, and only
  after thresholds are met.

## 5. What Hishab uniquely combines (and what it does not claim)

Hishab uniquely combines, in one auditable loop: transaction-derived
forecast with stated confidence → shortfall/surplus detection → one
data-grounded Bangla/Banglish action → forecast-gated savings suggestion →
explicit-confirmation, idempotent money movement → denominator-explicit
outcome tracking.

It does **not** claim: superiority over any named commercial product;
proven real-user savings lift; shortfall reduction from forecasts or advice
alone; or demographic fairness (segments are usage-pattern only, with
nulls below minimum samples).
