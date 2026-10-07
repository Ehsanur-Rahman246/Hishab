/**
 * Product-experimentation service: judge-ready differentiation framework.
 *
 * PRIMARY HYPOTHESIS (kept verbatim in code, report, README, UI):
 *   "Compared with a standard transaction dashboard or rule-based savings
 *   planner, Hishab's combined workflow (forecast -> personalized
 *   Bangla/Banglish coaching -> one shortfall-prevention action -> explicit
 *   goal contribution confirmation) improves savings adherence, reduces
 *   cash-flow shortfall events, or improves goal completion."
 *
 * What this module does:
 * - Defines the three comparison arms (Control / Rule-Based / Hishab).
 * - Implements privacy-safe outcome metrics with explicit denominators.
 * - Implements the forecast-aware savings safety gate.
 * - Runs a DETERMINISTIC synthetic simulation over version-controlled
 *   fixtures (labelled synthetic_demo_only). This validates workflow LOGIC,
 *   never real-world user impact.
 * - Validates workflow event sequences and privacy-safe metadata.
 *
 * What this module never does:
 * - Never claims causal real-user impact from synthetic runs.
 * - Never declares a "winner" below the minimum evidence thresholds.
 * - Never moves money (simulation returns proposed/confirmed amounts as
 *   NUMBERS; real transfers stay in goalAutomationService behind explicit
 *   user confirmation + idempotency).
 */

export const HYPOTHESIS =
  "Compared with a standard transaction dashboard or rule-based savings planner, " +
  "Hishab's combined workflow (forecast -> personalized Bangla/Banglish coaching -> " +
  "one shortfall-prevention action -> explicit goal contribution confirmation) " +
  "improves savings adherence, reduces cash-flow shortfall events, or improves goal completion.";

export const SYNTHETIC_LABEL = "synthetic_demo_only";
export const SYNTHETIC_EVIDENCE_LABEL = "Synthetic demo only — not real-user impact.";
export const SYNTHETIC_NOW_ISO = "2026-07-15T00:00:00Z";
export const SYNTHETIC_DATE_WINDOW = "2026-01 to 2026-06 (completed months only; July 2026 partial month excluded)";

// ---------------------------------------------------------------------------
// A. Comparison arms
// ---------------------------------------------------------------------------

export const ARMS = {
  control: {
    id: "control",
    name: "Control: Standard Transaction Dashboard",
    includes: [
      "historical transaction list",
      "spending totals and category chart",
    ],
    excludes: [
      "no forecast",
      "no personalized coach",
      "no proactive shortfall alert",
      "no savings recommendation",
    ],
  },
  rule_based: {
    id: "rule_based",
    name: "Baseline: Rule-Based Savings Planner",
    includes: [
      "standard dashboard (transaction list, totals, category chart)",
      "static rule: save 10% of average monthly income",
      "manual goal contribution",
    ],
    excludes: [
      "no forecast-driven prioritization",
      "no personalized multilingual coaching",
      "no context-aware shortfall prevention",
    ],
  },
  hishab_combined: {
    id: "hishab_combined",
    name: "Hishab Combined Workflow",
    includes: [
      "four-week forecast with confidence and shortfall risk",
      "detected likely shortfall / surplus",
      "Bangla, English, or Banglish explanation grounded in the user's data",
      "one prioritized suggested action",
      "goal suggestion only when it does not increase shortfall risk",
      "explicit user confirmation before any contribution",
      "feedback capture: accepted, dismissed, completed, useful/not useful",
    ],
    excludes: [
      "no automatic money movement (confirmation always required)",
      "no savings suggestion during forecasted shortfall",
    ],
  },
};

export const VALID_ARMS = Object.keys(ARMS);

// The 12 instrumented workflow events (minimal privacy-safe data only).
export const EXPERIMENT_EVENT_TYPES = [
  "forecast_viewed",
  "shortfall_plan_shown",
  "coach_language_used",
  "coach_action_accepted",
  "coach_action_dismissed",
  "goal_suggestion_shown",
  "goal_contribution_proposed",
  "goal_contribution_confirmed",
  "goal_contribution_cancelled",
  "goal_contribution_completed",
  "feedback_useful",
  "feedback_not_useful",
];

export const VALID_COACH_LANGUAGES = ["bn", "en", "mixed"];

// Evidence thresholds: below these, report "insufficient evidence", never a winner.
export const MIN_ARM_N_FOR_CLAIM = 10;
export const MIN_MONTHS_PER_ARM_FOR_RATE = 2;
export const MIN_GOAL_ELIGIBILITY_DAYS = 30;
export const RULE_BASED_SAVINGS_RATE = 0.1;

const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Balanced arm assignment for the real-user pilot (deterministic round-robin).
 * index 0 -> control, 1 -> rule_based, 2 -> hishab_combined, then repeats.
 * Deterministic so enrolment order alone decides the arm; no hidden randomness.
 */
export function assignArmBalanced(enrolmentIndex) {
  const order = ["control", "rule_based", "hishab_combined"];
  const i = Number(enrolmentIndex);
  if (!Number.isInteger(i) || i < 0) throw new Error("enrolmentIndex must be a non-negative integer");
  return order[i % order.length];
}

// ---------------------------------------------------------------------------
// B. Measurable outcome metrics (privacy-safe, denominator-explicit)
// ---------------------------------------------------------------------------

/**
 * Savings adherence = actualSavingsBDT / plannedSavingsBDT.
 * No-plan cases are null / not eligible — never 100%, never 0%.
 */
export function computeSavingsAdherence(plannedSavingsBDT, actualSavingsBDT) {
  const planned = Number(plannedSavingsBDT);
  const actual = Number(actualSavingsBDT);
  if (!Number.isFinite(planned) || planned <= 0) {
    return {
      plannedSavingsBDT: Number.isFinite(planned) ? planned : 0,
      actualSavingsBDT: Number.isFinite(actual) ? actual : 0,
      savingsAdherenceRate: null,
      eligible: false,
      reason: "no_plan",
      limitation:
        "No explicit savings plan existed for this cycle, so adherence is not eligible (null) — never reported as 100% or 0%.",
    };
  }
  return {
    plannedSavingsBDT: round2(planned),
    actualSavingsBDT: Number.isFinite(actual) ? round2(Math.max(0, actual)) : 0,
    savingsAdherenceRate: round3(Math.max(0, actual) / planned),
    eligible: true,
    reason: null,
    limitation: "Adherence reflects confirmed, completed contributions against explicitly planned/accepted amounts only.",
  };
}

/**
 * Shortfall events over COMPLETED observed months only.
 * Observed historical shortfalls and forecasted risk are reported separately.
 */
export function computeShortfallEventRate(months = []) {
  const rows = Array.isArray(months) ? months : [];
  const completedObservedMonths = rows.length;
  if (completedObservedMonths === 0) {
    return {
      shortfallMonths: 0,
      completedObservedMonths: 0,
      shortfallEventRate: null,
      eligible: false,
      reason: "no_completed_months",
      limitation: "No completed observed months exist, so no shortfall-event rate can be computed.",
    };
  }
  const shortfallMonths = rows.filter((m) => Number(m?.expense) > Number(m?.income)).length;
  return {
    shortfallMonths,
    completedObservedMonths,
    shortfallEventRate: round3(shortfallMonths / completedObservedMonths),
    eligible: true,
    reason: null,
    limitation:
      "Observed historical shortfalls only. Forecasted risk is reported separately and never counted as an observed event.",
  };
}

/**
 * Goal completion over eligible goals only. Newly created goals without
 * enough elapsed time are excluded from completion-rate claims.
 * goals: [{ createdAt, targetDate, status, completedAt }].
 */
export function computeGoalCompletion(goals = [], now = new Date()) {
  const list = Array.isArray(goals) ? goals : [];
  const nowMs = new Date(now).getTime();
  const minAgeMs = MIN_GOAL_ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000;
  const eligibleGoals = list.filter((g) => {
    if (String(g?.status) === "completed") return true;
    const created = new Date(g?.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    return nowMs - created >= minAgeMs;
  });
  const completed = eligibleGoals.filter((g) => String(g?.status) === "completed");
  const onTime = completed.filter((g) => {
    if (!g?.completedAt || !g?.targetDate) return false;
    return new Date(g.completedAt).getTime() <= new Date(g.targetDate).getTime();
  });
  if (eligibleGoals.length === 0) {
    return {
      completedGoals: 0,
      eligibleGoals: 0,
      onTimeCompletedGoals: 0,
      goalCompletionRate: null,
      onTimeCompletionRate: null,
      eligible: false,
      reason: "no_eligible_goals",
      limitation: `No goals with >= ${MIN_GOAL_ELIGIBILITY_DAYS} days elapsed (or completed) exist; newly created goals are excluded from completion-rate claims.`,
    };
  }
  return {
    completedGoals: completed.length,
    eligibleGoals: eligibleGoals.length,
    onTimeCompletedGoals: onTime.length,
    goalCompletionRate: round3(completed.length / eligibleGoals.length),
    onTimeCompletionRate: round3(onTime.length / eligibleGoals.length),
    eligible: true,
    reason: null,
    limitation: `Eligible goals only (>= ${MIN_GOAL_ELIGIBILITY_DAYS} days elapsed or already completed). On-time = completedAt <= targetDate.`,
  };
}

/**
 * Standard envelope: every metric response carries denominator, sample
 * count, date range, eligibility state, and limitation text.
 */
export function metricEnvelope({
  metric,
  numerator,
  denominator,
  sampleCount,
  dateRange,
  eligibility,
  limitation,
  isSynthetic = false,
}) {
  return {
    metric,
    numerator,
    denominator,
    sampleCount,
    dateRange,
    eligibility,
    limitation,
    isSynthetic,
    syntheticLabel: isSynthetic ? SYNTHETIC_EVIDENCE_LABEL : null,
  };
}

// ---------------------------------------------------------------------------
// Forecast-aware savings safety gate (the core Hishab differentiation)
// ---------------------------------------------------------------------------

/**
 * Decide whether a goal contribution may be suggested.
 * - Forecasted shortfall (projected expense > projected income) => DEFER:
 *   no suggestion; suggesting savings now would increase shortfall risk.
 * - Forecasted surplus => allow min(requested, surplus, cap).
 * Pure function; returns numbers only and never moves money.
 */
export function recommendGoalContribution({
  projectedIncomeBDT = 0,
  projectedExpenseBDT = 0,
  requestedBDT = 0,
  capBDT = Number.POSITIVE_INFINITY,
} = {}) {
  const income = Number(projectedIncomeBDT) || 0;
  const expense = Number(projectedExpenseBDT) || 0;
  const requested = Number(requestedBDT) || 0;
  const cap = Number.isFinite(Number(capBDT)) ? Number(capBDT) : Number.POSITIVE_INFINITY;
  const surplus = round2(income - expense);
  if (surplus <= 0) {
    return {
      allowed: false,
      amountBDT: 0,
      suggestedBDT: 0,
      projectedSurplusBDT: surplus,
      increasesShortfallRisk: requested > 0,
      reason: "forecasted_shortfall_defer",
      explanation:
        "Projected expenses meet or exceed projected income, so no savings contribution is suggested this cycle to avoid increasing shortfall risk.",
    };
  }
  const amount = Math.min(requested, surplus, cap);
  if (!(amount > 0)) {
    return {
      allowed: false,
      amountBDT: 0,
      suggestedBDT: 0,
      projectedSurplusBDT: surplus,
      increasesShortfallRisk: false,
      reason: "no_positive_amount",
      explanation: "No positive safe amount could be derived from the forecasted surplus.",
    };
  }
  return {
    allowed: true,
    amountBDT: round2(amount),
    suggestedBDT: round2(amount),
    projectedSurplusBDT: surplus,
    increasesShortfallRisk: false,
    reason: "forecasted_surplus_safe",
    explanation: `Forecasted surplus of BDT ${surplus} supports a safe contribution of BDT ${round2(amount)}. Explicit user confirmation is still required.`,
  };
}

/** Money movement always requires explicit user confirmation. */
export function confirmationRequiredFor(actionType) {
  return [
    "goal_contribution",
    "goal_transfer",
    "goal_release",
    "goal_deletion_refund",
    "wallet_withdrawal",
  ].includes(String(actionType));
}

// ---------------------------------------------------------------------------
// D. Deterministic synthetic simulation
// ---------------------------------------------------------------------------

/**
 * DOCUMENTED deterministic participant-decision rules (no randomness, no
 * hidden assumptions):
 * 1. Control: receives visibility only. No plan is ever offered, so
 *    plannedSavingsBDT is null and adherence is null/not eligible. No
 *    contribution is proposed or completed through any workflow.
 * 2. Rule-based: receives a fixed 10% of average monthly income suggestion
 *    EVERY cycle (no forecast check). The participant always accepts the
 *    static suggestion (planned = suggestion), but can only complete what
 *    the last completed month's cash position allows:
 *    actual = min(suggestion, max(0, lastMonthIncome - lastMonthExpense)).
 *    A suggestion shown while the 4-week forecast predicts a shortfall is
 *    flagged unsafeSuggestion = true.
 * 3. Hishab: forecast-aware. If the 4-week forecast predicts a shortfall,
 *    the workflow DEFERS: no goal suggestion, no proposal, no contribution
 *    (adherence null/not eligible, correctDeferral = true). If surplus is
 *    forecast, it proposes min(10% of avg income, surplus); the participant
 *    accepts the safe proposal, explicitly confirms, and completes it
 *    (planned = actual = safe amount, adherence = 1).
 * 4. Feedback: every participant shown a plan submits useful/not-useful
 *    feedback (synthetic funnel completeness, not a real-user outcome).
 */
export function forecastFromMonths(months = []) {
  const rows = Array.isArray(months) ? months : [];
  if (rows.length === 0) {
    return { projectedIncomeBDT: 0, projectedExpenseBDT: 0, forecastedShortfall: false, risk: "low" };
  }
  const avg = (k) => rows.reduce((s, m) => s + (Number(m?.[k]) || 0), 0) / rows.length;
  const projectedIncomeBDT = round2(avg("income"));
  const projectedExpenseBDT = round2(avg("expense"));
  const forecastedShortfall = projectedExpenseBDT > projectedIncomeBDT;
  return {
    projectedIncomeBDT,
    projectedExpenseBDT,
    forecastedShortfall,
    risk: forecastedShortfall ? "high" : "low",
  };
}

export function averageMonthlyIncome(months = []) {
  if (!months.length) return 0;
  return round2(months.reduce((s, m) => s + (Number(m?.income) || 0), 0) / months.length);
}

export function simulateParticipant(fixture = {}) {
  const arm = String(fixture?.arm);
  if (!VALID_ARMS.includes(arm)) throw new Error(`unknown arm: ${arm}`);
  const months = Array.isArray(fixture?.observedMonths) ? fixture.observedMonths : [];
  const language = VALID_COACH_LANGUAGES.includes(fixture?.uiLanguagePreference)
    ? fixture.uiLanguagePreference
    : "mixed";
  const forecast = forecastFromMonths(months);
  const avgIncome = averageMonthlyIncome(months);
  const last = months[months.length - 1] || { income: 0, expense: 0 };
  const lastMonthCash = round2((Number(last.income) || 0) - (Number(last.expense) || 0));
  const shortfallStats = computeShortfallEventRate(months);
  const events = ["forecast_viewed", "shortfall_plan_shown", "coach_language_used"];
  const goalTarget = Number(fixture?.goal?.targetBDT) || 0;
  const priorSaved = Number(fixture?.goal?.priorSavedBDT) || 0;

  let planned = null;
  let actual = 0;
  let unsafeSuggestion = false;
  let correctDeferral = false;
  let contributionProposed = false;
  let contributionConfirmed = false;
  let contributionCompleted = false;
  let planAccepted = false;
  let planShown = false;

  if (arm === "control") {
    // Visibility only: no plan, no suggestion, no contribution.
    planShown = false;
  } else if (arm === "rule_based") {
    const suggestion = Math.round(avgIncome * RULE_BASED_SAVINGS_RATE);
    planShown = true;
    planned = suggestion;
    planAccepted = true; // static-rule followers accept the fixed suggestion
    contributionProposed = true; // manual contribution initiated
    actual = Math.min(suggestion, Math.max(0, lastMonthCash));
    contributionCompleted = actual > 0;
    // Confirmation flow does not exist in the rule-based arm (manual move).
    contributionConfirmed = contributionCompleted;
    unsafeSuggestion = forecast.forecastedShortfall && suggestion > 0;
    events.push("coach_action_accepted", "goal_suggestion_shown", "goal_contribution_proposed");
    if (contributionCompleted) events.push("goal_contribution_completed");
    events.push("feedback_useful");
  } else {
    // hishab_combined: forecast-aware + confirmation-gated.
    planShown = true;
    planAccepted = true; // accepts the (possibly deferral) advisory plan
    events.push("coach_action_accepted");
    const gate = recommendGoalContribution({
      projectedIncomeBDT: forecast.projectedIncomeBDT,
      projectedExpenseBDT: forecast.projectedExpenseBDT,
      requestedBDT: Math.round(avgIncome * RULE_BASED_SAVINGS_RATE),
    });
    if (!gate.allowed) {
      correctDeferral = true; // shortfall forecast: correctly suggested nothing
      events.push("feedback_useful");
    } else {
      planned = gate.amountBDT;
      contributionProposed = true;
      contributionConfirmed = true; // explicit user confirmation (simulated accept)
      actual = gate.amountBDT;
      contributionCompleted = true;
      events.push(
        "goal_suggestion_shown",
        "goal_contribution_proposed",
        "goal_contribution_confirmed",
        "goal_contribution_completed",
        "feedback_useful",
      );
    }
  }

  const adherence = planned === null
    ? computeSavingsAdherence(null, 0)
    : computeSavingsAdherence(planned, actual);
  const finalSaved = round2(priorSaved + actual);
  const goalStatus = finalSaved >= goalTarget && goalTarget > 0 ? "completed" : "active";
  const completion = computeGoalCompletion(
    [
      {
        createdAt: fixture?.goal?.createdAt || "2026-01-10T00:00:00Z",
        targetDate: fixture?.goal?.targetDate || "2026-12-31T00:00:00Z",
        status: goalStatus,
        completedAt: goalStatus === "completed" ? SYNTHETIC_NOW_ISO : null,
      },
    ],
    new Date(SYNTHETIC_NOW_ISO),
  );

  return {
    participantId: String(fixture?.participantId),
    arm,
    synthetic: SYNTHETIC_LABEL,
    uiLanguagePreference: language,
    forecast,
    averageMonthlyIncomeBDT: avgIncome,
    lastMonthCashBDT: lastMonthCash,
    plannedSavingsBDT: planned,
    actualSavingsBDT: actual,
    adherence,
    shortfall: shortfallStats,
    goalCompletion: completion,
    planShown,
    planAccepted,
    unsafeSuggestion,
    correctDeferral,
    contributionProposed,
    contributionConfirmed,
    contributionCompleted,
    events,
  };
}

/** Aggregate per-participant simulations into per-arm outcome envelopes. */
export function runSyntheticExperiment(fixtures = [], now = new Date(SYNTHETIC_NOW_ISO)) {
  const sims = fixtures.map(simulateParticipant);
  const dateRange = SYNTHETIC_DATE_WINDOW;
  const arms = {};
  for (const arm of VALID_ARMS) {
    const group = sims.filter((s) => s.arm === arm);
    const n = group.length;

    const eligibleAdherence = group.filter((s) => s.adherence.eligible);
    const avgAdherence = eligibleAdherence.length > 0
      ? round3(eligibleAdherence.reduce((s, p) => s + p.adherence.savingsAdherenceRate, 0) / eligibleAdherence.length)
      : null;

    const shortfallMonths = group.reduce((s, p) => s + p.shortfall.shortfallMonths, 0);
    const observedMonths = group.reduce((s, p) => s + p.shortfall.completedObservedMonths, 0);
    const shortfallRate = observedMonths > 0 ? round3(shortfallMonths / observedMonths) : null;

    const completedGoals = group.reduce((s, p) => s + p.goalCompletion.completedGoals, 0);
    const eligibleGoals = group.reduce((s, p) => s + p.goalCompletion.eligibleGoals, 0);
    const goalRate = eligibleGoals > 0 ? round3(completedGoals / eligibleGoals) : null;

    const shownTo = group.filter((s) => s.planShown);
    const acceptanceRate = shownTo.length > 0
      ? round3(shownTo.filter((s) => s.planAccepted).length / shownTo.length)
      : null;
    const completedContributionRate = n > 0
      ? round3(group.filter((s) => s.contributionCompleted).length / n)
      : null;
    const unsafeSuggestionRate = shownTo.length > 0
      ? round3(group.filter((s) => s.unsafeSuggestion).length / shownTo.length)
      : null;

    const sufficient = n >= MIN_ARM_N_FOR_CLAIM && observedMonths >= MIN_MONTHS_PER_ARM_FOR_RATE * n;

    arms[arm] = {
      arm,
      sampleCount: n,
      dateRange,
      avgSavingsAdherence: metricEnvelope({
        metric: "savingsAdherenceRate",
        numerator: eligibleAdherence.reduce((s, p) => s + p.adherence.actualSavingsBDT, 0),
        denominator: eligibleAdherence.reduce((s, p) => s + p.adherence.plannedSavingsBDT, 0),
        sampleCount: eligibleAdherence.length,
        dateRange,
        eligibility: eligibleAdherence.length > 0
          ? `${eligibleAdherence.length}/${n} participants with an explicit plan`
          : "no eligible participants (no explicit plan offered or accepted)",
        limitation: "Average over eligible participants only; no-plan cases are excluded, never counted as 100%.",
        isSynthetic: true,
      }),
      avgSavingsAdherenceValue: avgAdherence,
      shortfallEventRate: metricEnvelope({
        metric: "shortfallEventRate",
        numerator: shortfallMonths,
        denominator: observedMonths,
        sampleCount: n,
        dateRange,
        eligibility: observedMonths > 0 ? "completed observed months only" : "no completed months",
        limitation: "Observed historical shortfalls only; forecasted risk is reported separately and never counted as an event.",
        isSynthetic: true,
      }),
      shortfallEventRateValue: shortfallRate,
      goalCompletionRate: metricEnvelope({
        metric: "goalCompletionRate",
        numerator: completedGoals,
        denominator: eligibleGoals,
        sampleCount: n,
        dateRange,
        eligibility: `${eligibleGoals}/${group.length} goals eligible (>= ${MIN_GOAL_ELIGIBILITY_DAYS} days elapsed or completed)`,
        limitation: "Newly created goals without enough elapsed time are excluded from completion-rate claims.",
        isSynthetic: true,
      }),
      goalCompletionRateValue: goalRate,
      planAcceptanceRate: acceptanceRate,
      planAcceptanceDenominator: shownTo.length,
      completedContributionRate: completedContributionRate,
      unsafeSuggestionRate,
      correctDeferrals: group.filter((s) => s.correctDeferral).length,
      evidenceStatus: sufficient ? "sufficient_for_comparison" : "insufficient_evidence",
    };
  }

  const anyInsufficient = VALID_ARMS.some((a) => arms[a].evidenceStatus === "insufficient_evidence");
  return {
    isSynthetic: true,
    syntheticLabel: SYNTHETIC_EVIDENCE_LABEL,
    syntheticMarker: SYNTHETIC_LABEL,
    hypothesis: HYPOTHESIS,
    dateRange,
    evaluatedAt: new Date(now).toISOString(),
    arms,
    participants: sims.map((s) => s.participantId),
    winnerDeclared: null,
    overallStatus: anyInsufficient ? "insufficient_evidence" : "directional_comparison_only",
    limitation:
      `Synthetic workflow validation with ${sims.length} scripted participants (${VALID_ARMS.map((a) => `${arms[a].sampleCount} per ${a}`).join(", ")}). ` +
      "Validates workflow logic (safety gate, confirmation gating, metric math) — NOT real-world user impact. " +
      `Per-arm n < ${MIN_ARM_N_FOR_CLAIM}: no winner is declared and no causal claim is made. ` +
      "Real-user impact requires the consented pilot protocol (2-3 monthly cycles, predefined primary metric).",
  };
}

// ---------------------------------------------------------------------------
// E. Event-sequence + privacy validation
// ---------------------------------------------------------------------------

/**
 * Validate a workflow event-type sequence.
 * Hard violations (safety-relevant): confirmation/completion without the
 * required prior step. Returns { ok, violations[] }.
 */
export function validateEventSequence(eventTypes = []) {
  const seq = Array.isArray(eventTypes) ? eventTypes.map(String) : [];
  const violations = [];
  const has = (t) => seq.includes(t);
  const indexOf = (t) => seq.indexOf(t);

  if (has("goal_contribution_confirmed") && !has("goal_contribution_proposed")) {
    violations.push("confirmation_without_proposal: goal_contribution_confirmed requires a prior goal_contribution_proposed.");
  }
  if (has("goal_contribution_confirmed") && has("goal_contribution_proposed")
    && indexOf("goal_contribution_confirmed") < indexOf("goal_contribution_proposed")) {
    violations.push("confirmation_before_proposal: confirmation must follow, not precede, the proposal.");
  }
  if (has("goal_contribution_completed") && !has("goal_contribution_confirmed")) {
    violations.push("completion_without_confirmation: goal_contribution_completed requires a prior goal_contribution_confirmed.");
  }
  if ((has("coach_action_accepted") || has("coach_action_dismissed")) && !has("shortfall_plan_shown")) {
    violations.push("decision_without_plan: accept/dismiss requires a prior shortfall_plan_shown.");
  }
  if (has("goal_contribution_proposed")
    && !has("shortfall_plan_shown") && !has("goal_suggestion_shown")) {
    violations.push("proposal_without_plan: goal_contribution_proposed requires a prior shortfall_plan_shown or goal_suggestion_shown.");
  }
  if ((has("feedback_useful") || has("feedback_not_useful")) && !has("shortfall_plan_shown")) {
    violations.push("feedback_without_plan: feedback requires a prior shortfall_plan_shown.");
  }
  return { ok: violations.length === 0, violations };
}

// Allowlisted privacy-safe metadata keys for stored workflow events.
const SAFE_METADATA_KEYS = new Set([
  "amountBDT",
  "language",
  "arm",
  "goalId",
  "planId",
  "cycleKey",
  "reason",
  "useful",
  "feature",
]);
const FORBIDDEN_METADATA_SUBSTRINGS = [
  "prompt", "transaction", "raw", "phone", "pin", "secret", "token",
  "password", "key", "balance", "account", "nid", "address", "email",
];

/** Strip everything but the privacy-safe allowlist; round amounts; cap strings. */
export function sanitizeExperimentMetadata(meta = {}) {
  const out = {};
  if (!meta || typeof meta !== "object") return out;
  for (const [k, v] of Object.entries(meta)) {
    if (!SAFE_METADATA_KEYS.has(k)) continue;
    if (FORBIDDEN_METADATA_SUBSTRINGS.some((s) => k.toLowerCase().includes(s) && k !== "cycleKey")) continue;
    if (k === "amountBDT") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = round2(n);
      continue;
    }
    if (typeof v === "string") {
      out[k] = v.slice(0, 200);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}
