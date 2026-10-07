// Numerical-hallucination adversarial suite (offline, deterministic).
// Covers: invented BDT balances, wrong totals/percentages/goal balances,
// Bengali digits + Banglish formats, unsupported forecast claims, confident
// but incorrect statements. Guard must REPLACE (not merely disclaim) with a
// conservative "cannot be verified" answer; grounded replies stay intact.
// Run: node --test tests/coachNumberGuardHardening.test.js

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyNumericGroundingGuard,
  conservativeFallbackAnswer,
} from "../src/services/groqCoachService.js";
import { runGroundingEvaluation, scoreCase } from "../src/services/coachNumericalScorer.js";

const context = {
  totals: { income: 50000, expense: 32000, currency: "BDT" },
  topCategories: [{ category: "Food", amount: 8500 }],
  walletBalance: 12500,
  goals: [{ title: "Emergency", targetAmount: 10000, savedAmount: 6000 }],
  forecast: {
    weeks: [
      { inflow: 12000, outflow: 9000, balance: 15500, risk: "low" },
      { inflow: 12000, outflow: 9000, balance: 18500, risk: "low" },
    ],
  },
};

const mk = (answer, language = "en", extra = {}) => ({
  language,
  headline: "H",
  answer,
  actions: [{ title: "T", detail: "D" }],
  tone: "neutral",
  disclaimer: "Estimate.",
  ...extra,
});

const ADVERSARIAL = [
  { id: "INV-BAL", text: "Your wallet balance is BDT 99,999.", mustReplace: true },
  { id: "WRONG-TOTAL", text: "Your total income is BDT 75,000 and expenses BDT 10,000.", mustReplace: true },
  { id: "WRONG-PCT", text: "You spent 95% of your income on food.", mustReplace: true },
  { id: "WRONG-GOAL", text: "Your Emergency goal has 9,500 taka saved of 10,000.", mustReplace: true },
  { id: "BN-DIGITS", text: "আপনার ব্যালেন্স ৯৯৯৯৯ টাকা।", mustReplace: true },
  { id: "BN-GOAL", text: "Emergency goal এ ১২৫০ টাকা জমা আছে।", mustReplace: true },
  { id: "BANGLISH", text: "tomar wallet balance 88888 taka, food e 50000 khoroch hoise", mustReplace: true },
  { id: "FORECAST", text: "Next week you will earn BDT 200,000 with low risk.", mustReplace: true },
  { id: "CONFIDENT", text: "Definitely, guaranteed: your savings are exactly BDT 123,456.", mustReplace: true },
];

const GROUNDED = [
  { id: "OK-TOTALS", text: "Your total income is BDT 50,000 and expenses are BDT 32,000.", mustReplace: false },
  { id: "OK-FOOD", text: "Food is BDT 8,500 this month.", mustReplace: false },
  { id: "OK-GOAL-REMAIN", text: "Your Emergency goal needs 4000 more to reach 10000.", mustReplace: false },
];

describe("numerical hallucination hardening", () => {
  for (const c of [...ADVERSARIAL, ...GROUNDED]) {
    it(`${c.id}: ${c.mustReplace ? "replaced" : "preserved"}`, () => {
      const lang = /[\u0980-\u09FF]/.test(c.text) ? "bn" : "en";
      const { coach, numericGrounding } = applyNumericGroundingGuard(mk(c.text, lang), context);
      assert.equal(numericGrounding.checked, true);
      if (c.mustReplace) {
        assert.equal(numericGrounding.replaced, true, `${c.id} must be replaced`);
        assert.ok(numericGrounding.unsupportedClaims.length > 0);
        assert.ok(/cannot be verified|যাচাই করা যায়নি/i.test(coach.answer), "conservative wording required");
        assert.deepEqual(coach.actions, []);
      } else {
        assert.equal(numericGrounding.replaced, false, `${c.id} grounded answer must survive`);
        assert.equal(coach.answer, c.text);
      }
    });
  }

  it("reports accuracy, unsupported-claim rate and failed IDs", () => {
    const evaluated = [...ADVERSARIAL, ...GROUNDED].map((c) => {
      const lang = /[\u0980-\u09FF]/.test(c.text) ? "bn" : "en";
      const { numericGrounding } = applyNumericGroundingGuard(mk(c.text, lang), context);
      const ok = c.mustReplace ? numericGrounding.replaced === true : numericGrounding.replaced === false;
      return { case: { id: c.id }, result: { passed: ok, unsupported: numericGrounding.unsupportedClaims, languageOk: true, reasons: ok ? [] : ["mismatch"] } };
    });
    const report = runGroundingEvaluation(evaluated);
    assert.equal(report.casesRun, ADVERSARIAL.length + GROUNDED.length);
    assert.equal(report.failedCases.length, 0, JSON.stringify(report.failedCases));
    assert.ok(report.numericAccuracy === 1);
    // Unsupported-claim rate = share of replies carrying an invented figure.
    const withClaims = evaluated.filter((e) => e.result.unsupported.length > 0).length;
    assert.equal(withClaims, ADVERSARIAL.length);
  });

  it("conservative fallback exists in en/bn/mixed", () => {
    assert.ok(/cannot be verified/i.test(conservativeFallbackAnswer("en")));
    assert.ok(conservativeFallbackAnswer("bn").length > 10);
    assert.ok(/cannot be verified/i.test(conservativeFallbackAnswer("mixed")));
  });

  it("scorer flags the invented-amount fixture", () => {
    const r = scoreCase("Your balance is BDT 99,999.", {
      id: "x", expectedFacts: [], trustedNumbers: [50000, 32000, 12500],
    });
    assert.ok(r.unsupported.length > 0);
  });
});
