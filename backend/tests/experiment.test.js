import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARMS,
  EXPERIMENT_EVENT_TYPES,
  MIN_ARM_N_FOR_CLAIM,
  SYNTHETIC_EVIDENCE_LABEL,
  SYNTHETIC_LABEL,
  VALID_ARMS,
  assignArmBalanced,
  computeGoalCompletion,
  computeSavingsAdherence,
  computeShortfallEventRate,
  confirmationRequiredFor,
  metricEnvelope,
  recommendGoalContribution,
  runSyntheticExperiment,
  sanitizeExperimentMetadata,
  simulateParticipant,
  validateEventSequence,
} from "../src/services/experimentService.js";
import {
  SYNTHETIC_FIXTURE_MARKER,
  SYNTHETIC_PARTICIPANTS,
  assertAllFixturesSynthetic,
} from "../src/services/experimentFixtures.js";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readRepo = (p) => readFileSync(join(backendRoot, "..", p), "utf8");

// Hand-verified expected values from the 9 scripted fixtures
// (window Jan–Jun 2026, evaluated 2026-07-15). If fixtures change, these
// MUST be recomputed and the report updated alongside.
const EXPECTED = {
  perArmN: 3,
  control: {
    adherence: null, adherenceEligible: 0, shortfall: 0.5,
    shortfallNum: 9, shortfallDen: 18, goal: 0.333, acceptance: null,
    completedContribution: 0, unsafe: null, deferrals: 0,
  },
  rule_based: {
    adherence: 0.333, adherenceNum: 2500, adherenceDen: 6500, adherenceEligible: 3,
    shortfall: 0.5, shortfallNum: 9, shortfallDen: 18, goal: 0.333, acceptance: 1,
    completedContribution: 0.333, unsafe: 0.333, deferrals: 0,
  },
  hishab_combined: {
    adherence: 1, adherenceNum: 4500, adherenceDen: 4500, adherenceEligible: 2,
    shortfall: 0.5, shortfallNum: 9, shortfallDen: 18, goal: 0.333, acceptance: 1,
    completedContribution: 0.667, unsafe: 0, deferrals: 1,
  },
  overallStatus: "insufficient_evidence",
};

describe("experiment arms are defined with honest includes/excludes", () => {
  it("1. three arms exist with includes AND excludes", () => {
    assert.deepEqual([...VALID_ARMS].sort(), ["control", "hishab_combined", "rule_based"]);
    for (const arm of VALID_ARMS) {
      assert.ok(ARMS[arm].includes.length > 0, `${arm} needs includes`);
      assert.ok(ARMS[arm].excludes.length > 0, `${arm} needs excludes`);
    }
  });

  it("2. control promises no forecast/coach/alert/recommendation", () => {
    const text = [...ARMS.control.excludes].join(" ").toLowerCase();
    for (const word of ["no forecast", "no personalized coach", "no proactive shortfall alert", "no savings recommendation"]) {
      assert.ok(text.includes(word), `control excludes must state "${word}"`);
    }
  });

  it("3. hishab arm requires forecast, one action, safety check, confirmation", () => {
    const text = ARMS.hishab_combined.includes.join(" ").toLowerCase();
    for (const word of ["forecast", "one prioritized", "does not increase shortfall risk", "explicit user confirmation"]) {
      assert.ok(text.includes(word), `hishab includes must state "${word}"`);
    }
  });

  it("4. balanced assignment is deterministic round-robin", () => {
    assert.equal(assignArmBalanced(0), "control");
    assert.equal(assignArmBalanced(1), "rule_based");
    assert.equal(assignArmBalanced(2), "hishab_combined");
    assert.equal(assignArmBalanced(3), "control");
    assert.equal(assignArmBalanced(30), "control");
    assert.throws(() => assignArmBalanced(-1));
    assert.throws(() => assignArmBalanced(1.5));
  });
});

describe("metric numerator/denominator correctness", () => {
  it("5. savings adherence divides actual by planned", () => {
    const m = computeSavingsAdherence(2500, 2500);
    assert.equal(m.savingsAdherenceRate, 1);
    assert.equal(m.eligible, true);
    const half = computeSavingsAdherence(2000, 1000);
    assert.equal(half.savingsAdherenceRate, 0.5);
  });

  it("6. no-plan adherence is null/not eligible, never 100%", () => {
    for (const planned of [null, undefined, 0, -100]) {
      const m = computeSavingsAdherence(planned, 0);
      assert.equal(m.savingsAdherenceRate, null);
      assert.equal(m.eligible, false);
      assert.equal(m.reason, "no_plan");
      assert.notEqual(m.savingsAdherenceRate, 1);
    }
  });

  it("7. shortfall-event rate counts completed months where expense > income", () => {
    const r = computeShortfallEventRate([
      { month: "2026-01", income: 20000, expense: 22500 },
      { month: "2026-02", income: 20000, expense: 18000 },
    ]);
    assert.equal(r.shortfallMonths, 1);
    assert.equal(r.completedObservedMonths, 2);
    assert.equal(r.shortfallEventRate, 0.5);
  });

  it("8. empty months yield null shortfall rate, not zero", () => {
    const r = computeShortfallEventRate([]);
    assert.equal(r.shortfallEventRate, null);
    assert.equal(r.eligible, false);
  });

  it("9. goal completion tracks on-time separately and excludes new goals", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const goals = [
      { createdAt: "2026-01-10T00:00:00Z", targetDate: "2026-12-31T00:00:00Z", status: "completed", completedAt: "2026-06-01T00:00:00Z" },
      { createdAt: "2026-01-10T00:00:00Z", targetDate: "2026-05-01T00:00:00Z", status: "completed", completedAt: "2026-06-01T00:00:00Z" },
      { createdAt: "2026-01-10T00:00:00Z", targetDate: "2026-12-31T00:00:00Z", status: "active", completedAt: null },
      { createdAt: "2026-07-10T00:00:00Z", targetDate: "2026-12-31T00:00:00Z", status: "active", completedAt: null }, // too new: excluded
    ];
    const c = computeGoalCompletion(goals, now);
    assert.equal(c.eligibleGoals, 3);
    assert.equal(c.completedGoals, 2);
    assert.equal(c.goalCompletionRate, 0.667);
    assert.equal(c.onTimeCompletedGoals, 1);
    assert.equal(c.onTimeCompletionRate, 0.333);
  });

  it("10. metric envelope always carries denominator/sample/dates/eligibility/limits", () => {
    const e = metricEnvelope({
      metric: "shortfallEventRate", numerator: 9, denominator: 18,
      sampleCount: 3, dateRange: "2026-01 to 2026-06",
      eligibility: "completed observed months only", limitation: "test limit",
      isSynthetic: true,
    });
    assert.equal(e.numerator, 9);
    assert.equal(e.denominator, 18);
    assert.equal(e.sampleCount, 3);
    assert.equal(e.dateRange, "2026-01 to 2026-06");
    assert.ok(e.eligibility);
    assert.ok(e.limitation);
    assert.equal(e.isSynthetic, true);
    assert.equal(e.syntheticLabel, SYNTHETIC_EVIDENCE_LABEL);
  });
});

describe("forecast-aware savings safety gate", () => {
  it("11. forecasted shortfall prevents an unsafe saving suggestion", () => {
    const g = recommendGoalContribution({
      projectedIncomeBDT: 20000, projectedExpenseBDT: 22500, requestedBDT: 2000,
    });
    assert.equal(g.allowed, false);
    assert.equal(g.amountBDT, 0);
    assert.equal(g.reason, "forecasted_shortfall_defer");
    assert.equal(g.increasesShortfallRisk, true);
  });

  it("12. surplus allows a safe goal recommendation capped by surplus", () => {
    const g = recommendGoalContribution({
      projectedIncomeBDT: 25000, projectedExpenseBDT: 20000, requestedBDT: 2500,
    });
    assert.equal(g.allowed, true);
    assert.equal(g.amountBDT, 2500);
    assert.equal(g.increasesShortfallRisk, false);
    const capped = recommendGoalContribution({
      projectedIncomeBDT: 21000, projectedExpenseBDT: 20000, requestedBDT: 5000,
    });
    assert.equal(capped.amountBDT, 1000);
  });

  it("13. confirmation is required before any contribution", () => {
    assert.equal(confirmationRequiredFor("goal_contribution"), true);
    assert.equal(confirmationRequiredFor("goal_transfer"), true);
    assert.equal(confirmationRequiredFor("wallet_withdrawal"), true);
    assert.equal(confirmationRequiredFor("forecast_view"), false);
  });
});

describe("deterministic synthetic simulation", () => {
  it("14. fixtures cover all required profiles and stay synthetic", () => {
    assert.equal(SYNTHETIC_PARTICIPANTS.length, 9);
    assert.equal(SYNTHETIC_FIXTURE_MARKER, SYNTHETIC_LABEL);
    assert.ok(assertAllFixturesSynthetic());
    const arms = SYNTHETIC_PARTICIPANTS.map((p) => p.arm).sort();
    assert.deepEqual(arms, [
      "control", "control", "control",
      "hishab_combined", "hishab_combined", "hishab_combined",
      "rule_based", "rule_based", "rule_based",
    ]);
    const langs = new Set(SYNTHETIC_PARTICIPANTS.map((p) => p.uiLanguagePreference));
    assert.ok(langs.has("bn") && langs.has("en") && langs.has("mixed"));
    const profiles = SYNTHETIC_PARTICIPANTS.map((p) => p.profile).join(" | ");
    assert.ok(profiles.includes("stable") || profiles.includes("predictable"));
    assert.ok(profiles.includes("irregular"));
    assert.ok(profiles.includes("shortfall"));
  });

  it("15. simulation is deterministic (same input, same output)", () => {
    const a = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
    const b = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
    assert.deepEqual(a, b);
  });

  it("16. per-arm synthetic outcomes match hand-verified values", () => {
    const r = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
    assert.equal(r.isSynthetic, true);
    assert.equal(r.syntheticMarker, SYNTHETIC_LABEL);
    assert.equal(r.winnerDeclared, null);
    assert.equal(r.overallStatus, EXPECTED.overallStatus);
    for (const arm of VALID_ARMS) {
      const got = r.arms[arm];
      const exp = EXPECTED[arm];
      assert.equal(got.sampleCount, EXPECTED.perArmN, `${arm} n`);
      assert.equal(got.avgSavingsAdherenceValue, exp.adherence, `${arm} adherence`);
      assert.equal(got.avgSavingsAdherence.sampleCount, exp.adherenceEligible, `${arm} adherence eligible n`);
      assert.equal(got.shortfallEventRateValue, exp.shortfall, `${arm} shortfall`);
      assert.equal(got.shortfallEventRate.numerator, exp.shortfallNum, `${arm} shortfall numerator`);
      assert.equal(got.shortfallEventRate.denominator, exp.shortfallDen, `${arm} shortfall denominator`);
      assert.equal(got.goalCompletionRateValue, exp.goal, `${arm} goal completion`);
      assert.equal(got.planAcceptanceRate, exp.acceptance, `${arm} acceptance`);
      assert.equal(got.completedContributionRate, exp.completedContribution, `${arm} completed contribution`);
      assert.equal(got.unsafeSuggestionRate, exp.unsafe, `${arm} unsafe suggestion`);
      assert.equal(got.correctDeferrals, exp.deferrals, `${arm} deferrals`);
      assert.equal(got.evidenceStatus, "insufficient_evidence", `${arm} must not claim sufficient evidence at n=3`);
    }
    assert.equal(r.arms.rule_based.avgSavingsAdherence.numerator, EXPECTED.rule_based.adherenceNum);
    assert.equal(r.arms.rule_based.avgSavingsAdherence.denominator, EXPECTED.rule_based.adherenceDen);
    assert.equal(r.arms.hishab_combined.avgSavingsAdherence.numerator, EXPECTED.hishab_combined.adherenceNum);
    assert.equal(r.arms.hishab_combined.avgSavingsAdherence.denominator, EXPECTED.hishab_combined.adherenceDen);
  });

  it("17. low sample size declares insufficient evidence, never a winner", () => {
    const r = runSyntheticExperiment(SYNTHETIC_PARTICIPANTS);
    assert.ok(r.arms.control.sampleCount < MIN_ARM_N_FOR_CLAIM);
    assert.equal(r.winnerDeclared, null);
    assert.match(r.limitation, /no winner is declared/i);
    assert.match(r.limitation, /NOT real-world user impact/);
  });

  it("18. hishab shortfall participant is deferred, never pushed to save", () => {
    const sim = simulateParticipant(SYNTHETIC_PARTICIPANTS.find((p) => p.participantId === "SYN-09"));
    assert.equal(sim.contributionProposed, false);
    assert.equal(sim.contributionConfirmed, false);
    assert.equal(sim.correctDeferral, true);
    assert.equal(sim.adherence.eligible, false);
    assert.equal(sim.unsafeSuggestion, false);
  });

  it("19. rule-based shortfall participant gets an unsafe suggestion", () => {
    const sim = simulateParticipant(SYNTHETIC_PARTICIPANTS.find((p) => p.participantId === "SYN-06"));
    assert.equal(sim.unsafeSuggestion, true);
    assert.equal(sim.adherence.savingsAdherenceRate, 0);
  });
});

describe("event sequence + privacy boundaries", () => {
  it("20. all 12 required event types are instrumented", () => {
    for (const t of [
      "forecast_viewed", "shortfall_plan_shown", "coach_language_used",
      "coach_action_accepted", "coach_action_dismissed", "goal_suggestion_shown",
      "goal_contribution_proposed", "goal_contribution_confirmed",
      "goal_contribution_cancelled", "goal_contribution_completed",
      "feedback_useful", "feedback_not_useful",
    ]) {
      assert.ok(EXPERIMENT_EVENT_TYPES.includes(t), `missing event type ${t}`);
    }
  });

  it("21. valid hishab sequences pass (including defer path)", () => {
    const full = validateEventSequence([
      "forecast_viewed", "shortfall_plan_shown", "coach_language_used",
      "coach_action_accepted", "goal_suggestion_shown", "goal_contribution_proposed",
      "goal_contribution_confirmed", "goal_contribution_completed", "feedback_useful",
    ]);
    assert.equal(full.ok, true);
    const defer = validateEventSequence([
      "forecast_viewed", "shortfall_plan_shown", "coach_language_used",
      "coach_action_accepted", "feedback_useful",
    ]);
    assert.equal(defer.ok, true);
    const dismissed = validateEventSequence([
      "forecast_viewed", "shortfall_plan_shown", "coach_language_used",
      "coach_action_dismissed", "feedback_not_useful",
    ]);
    assert.equal(dismissed.ok, true);
  });

  it("22. confirmation/completion without prior steps is rejected", () => {
    const badConfirm = validateEventSequence(["goal_contribution_confirmed"]);
    assert.equal(badConfirm.ok, false);
    assert.ok(badConfirm.violations.some((v) => v.includes("confirmation_without_proposal")));
    const badComplete = validateEventSequence(["goal_contribution_proposed", "goal_contribution_completed"]);
    assert.equal(badComplete.ok, false);
    assert.ok(badComplete.violations.some((v) => v.includes("completion_without_confirmation")));
    const reversed = validateEventSequence(["goal_contribution_confirmed", "goal_contribution_proposed"]);
    assert.equal(reversed.ok, false);
  });

  it("23. simulated hishab sequences are all valid", () => {
    for (const p of SYNTHETIC_PARTICIPANTS.filter((x) => x.arm === "hishab_combined")) {
      const sim = simulateParticipant(p);
      const v = validateEventSequence(sim.events);
      assert.equal(v.ok, true, `${p.participantId}: ${v.violations.join("; ")}`);
    }
  });

  it("24. metadata sanitizer keeps allowlist only, drops PII/secrets", () => {
    const clean = sanitizeExperimentMetadata({
      amountBDT: 2500.456, language: "bn", arm: "hishab_combined",
      goalId: "g1", cycleKey: "2026-07", reason: "safe surplus",
      rawTransactions: [{ amount: 999 }], phone: "01800", prompt: "ignore rules",
      apiKey: "sk-live", password: "x", balance: 50000,
    });
    assert.equal(clean.amountBDT, 2500.46);
    assert.equal(clean.language, "bn");
    assert.equal(clean.cycleKey, "2026-07");
    assert.ok(!("rawTransactions" in clean));
    assert.ok(!("phone" in clean));
    assert.ok(!("prompt" in clean));
    assert.ok(!("apiKey" in clean));
    assert.ok(!("password" in clean));
    assert.ok(!("balance" in clean));
  });

  it("25. synthetic labels stay out of production user data paths", () => {
    const src = readRepo("backend/src/controllers/experimentControllers.js");
    assert.ok(src.includes("isSynthetic: false"), "real-user event writes must default isSynthetic false");
    const model = readRepo("backend/src/models/ExperimentEvent.js");
    assert.ok(model.includes("default: false"), "model must default isSynthetic false");
    const sim = simulateParticipant(SYNTHETIC_PARTICIPANTS[0]);
    assert.equal(sim.synthetic, SYNTHETIC_LABEL);
  });
});

describe("report matches fixture calculations exactly", () => {
  it("26. DIFFERENTIATION_AND_IMPACT_REPORT.md carries the exact computed values", () => {
    const report = readRepo("DIFFERENTIATION_AND_IMPACT_REPORT.md");
    assert.ok(report.includes(SYNTHETIC_EVIDENCE_LABEL), "report must carry the synthetic-only label");
    assert.ok(report.includes("synthetic_demo_only"), "report must name the synthetic marker");
    assert.ok(report.includes("9 scripted participants"), "report must state the 9-participant sample");
    // Exact per-arm values from EXPECTED (recomputed above in test 16).
    const needles = [
      "control", "rule_based", "hishab_combined",
      "avgSavingsAdherenceValue: control=null",
      "avgSavingsAdherenceValue: rule_based=0.333",
      "avgSavingsAdherenceValue: hishab_combined=1",
      "shortfallEventRateValue: 0.5 (9/18) all arms",
      "goalCompletionRateValue: 0.333 (1/3) all arms",
      "completedContributionRate: control=0, rule_based=0.333, hishab_combined=0.667",
      "unsafeSuggestionRate: rule_based=0.333, hishab_combined=0",
      "overallStatus: insufficient_evidence",
      "winnerDeclared: none",
    ];
    for (const n of needles) {
      assert.ok(report.includes(n), `report must contain exact line: ${n}`);
    }
  });
});
