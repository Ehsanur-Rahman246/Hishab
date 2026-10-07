/**
 * Version-controlled SYNTHETIC participant fixtures for the differentiation
 * experiment. Clearly labelled `synthetic_demo_only`.
 *
 * These fixtures are SCRIPTED numbers for workflow-logic validation only.
 * They do not represent real customers or real financial behavior, and any
 * result computed from them must carry the synthetic label and must never be
 * presented as real-user proof.
 *
 * Coverage (3 participants x 3 arms = 9 total):
 * - stable salary + stable expenses + surplus (can save safely)
 * - irregular income (volatile cash flow)
 * - shortfall-facing (expenses exceed income; must be protected from saving)
 * - uiLanguagePreference bn / en / mixed as EXPLICIT UI-language preference
 *   only — never demographic inference.
 *
 * Window: completed months Jan-Jun 2026 (6 each); evaluated at 2026-07-15
 * (July partial month excluded from every baseline by construction).
 */

import { SYNTHETIC_LABEL } from "./experimentService.js";

export const SYNTHETIC_FIXTURE_MARKER = SYNTHETIC_LABEL;

const MONTHS_2026_H1 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

function flatMonths(income, expense) {
  return MONTHS_2026_H1.map((month) => ({ month, income, expense }));
}

function irregularMonths(incomes, expense) {
  return MONTHS_2026_H1.map((month, i) => ({ month, income: incomes[i], expense }));
}

// Irregular pattern: salary-like highs mixed with lean months.
const IRREGULAR_INCOMES = [30000, 12000, 28000, 10000, 26000, 14000];

function goal(targetBDT, priorSavedBDT) {
  return {
    targetBDT,
    priorSavedBDT,
    createdAt: "2026-01-10T00:00:00Z",
    targetDate: "2026-12-31T00:00:00Z",
  };
}

export const SYNTHETIC_PARTICIPANTS = [
  // ---- Control arm: visibility only -------------------------------------
  {
    participantId: "SYN-01",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "control",
    profile: "predictable salary, stable expenses, steady surplus",
    uiLanguagePreference: "bn",
    observedMonths: flatMonths(25000, 20000),
    goal: goal(20000, 20500), // self-directed saver: already over target without any plan
  },
  {
    participantId: "SYN-02",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "control",
    profile: "irregular income, stable expenses",
    uiLanguagePreference: "mixed",
    observedMonths: irregularMonths(IRREGULAR_INCOMES, 18000),
    goal: goal(20000, 5000),
  },
  {
    participantId: "SYN-03",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "control",
    profile: "likely shortfall: expenses exceed income every month",
    uiLanguagePreference: "en",
    observedMonths: flatMonths(20000, 22500),
    goal: goal(20000, 2000),
  },
  // ---- Rule-based arm: fixed 10% suggestion, no forecast check -----------
  {
    participantId: "SYN-04",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "rule_based",
    profile: "predictable salary, stable expenses, steady surplus",
    uiLanguagePreference: "bn",
    observedMonths: flatMonths(25000, 20000),
    goal: goal(20000, 18000),
  },
  {
    participantId: "SYN-05",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "rule_based",
    profile: "irregular income, stable expenses",
    uiLanguagePreference: "en",
    observedMonths: irregularMonths(IRREGULAR_INCOMES, 18000),
    goal: goal(20000, 5000),
  },
  {
    participantId: "SYN-06",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "rule_based",
    profile: "likely shortfall: expenses exceed income every month",
    uiLanguagePreference: "mixed",
    observedMonths: flatMonths(20000, 22500),
    goal: goal(20000, 2000),
  },
  // ---- Hishab combined-workflow arm: forecast-aware + confirmed ---------
  {
    participantId: "SYN-07",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "hishab_combined",
    profile: "predictable salary, stable expenses, steady surplus",
    uiLanguagePreference: "bn",
    observedMonths: flatMonths(25000, 20000),
    goal: goal(20000, 18000),
  },
  {
    participantId: "SYN-08",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "hishab_combined",
    profile: "irregular income, stable expenses",
    uiLanguagePreference: "mixed",
    observedMonths: irregularMonths(IRREGULAR_INCOMES, 18000),
    goal: goal(20000, 5000),
  },
  {
    participantId: "SYN-09",
    synthetic: SYNTHETIC_FIXTURE_MARKER,
    arm: "hishab_combined",
    profile: "likely shortfall: expenses exceed income every month",
    uiLanguagePreference: "en",
    observedMonths: flatMonths(20000, 22500),
    goal: goal(20000, 2000),
  },
];

/** Guard: every fixture must carry the synthetic marker (tested). */
export function assertAllFixturesSynthetic(participants = SYNTHETIC_PARTICIPANTS) {
  const bad = participants.filter((p) => p?.synthetic !== SYNTHETIC_FIXTURE_MARKER);
  if (bad.length > 0) {
    throw new Error(
      `Non-synthetic fixtures detected: ${bad.map((p) => p?.participantId).join(", ")}`,
    );
  }
  return true;
}
