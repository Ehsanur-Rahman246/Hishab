// Runtime numerical-grounding guard: unsupported figures get an explicit
// caution appended (never silent trust); supported figures pass untouched.
// Offline — no Groq, no network.
// Run: npm test (node --test tests/*.test.js)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyNumericGroundingGuard } from "../src/services/groqCoachService.js";

const context = {
  totals: { income: 50000, expense: 32000, currency: "BDT" },
  topCategories: [{ category: "Food", amount: 8500 }],
  walletBalance: 12500,
  goals: [],
  forecast: null,
};

const baseCoach = {
  language: "en",
  headline: "Monthly snapshot",
  answer: "Your total income is BDT 50,000 and expenses are BDT 32,000.",
  actions: [{ title: "Track food", detail: "Food is BDT 8,500 this month." }],
  tone: "neutral",
  disclaimer: "Estimate based on past transactions, not financial advice.",
};

describe("applyNumericGroundingGuard", () => {
  it("passes grounded replies untouched", () => {
    const { coach, numericGrounding } = applyNumericGroundingGuard(
      baseCoach,
      context,
    );
    assert.equal(numericGrounding.checked, true);
    assert.deepEqual(numericGrounding.unsupportedClaims, []);
    assert.equal(coach.disclaimer, baseCoach.disclaimer);
  });

  it("replaces invented amounts with a conservative no-figure answer", () => {
    const bad = {
      ...baseCoach,
      answer: "Your total income is BDT 99,999.",
    };
    const { coach, numericGrounding } = applyNumericGroundingGuard(
      bad,
      context,
    );
    assert.equal(numericGrounding.checked, true);
    assert.ok(numericGrounding.unsupportedClaims.length > 0);
    assert.equal(numericGrounding.replaced, true);
    assert.ok(/cannot be verified/i.test(coach.answer));
    assert.deepEqual(coach.actions, []);
    assert.ok(coach.disclaimer.length > baseCoach.disclaimer.length);
    assert.ok(/could not be verified/i.test(coach.disclaimer));
  });

  it("never throws on odd input", () => {
    const { numericGrounding } = applyNumericGroundingGuard(null, null);
    assert.equal(numericGrounding.unsupportedClaims.length, 0);
  });
});
