// Numerical-grounding evaluation for the Bangla/Banglish coach.
// Offline + deterministic: scores version-controlled fixture replies with
// coachNumericalScorer (never calls Groq, never needs an API key).
// Run: npm test  (node --test tests/*.test.js)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectReplyLanguage,
  extractFinancialNumbers,
  findUnsupportedFinancialClaims,
  normalizeDigits,
  runGroundingEvaluation,
  scoreCase,
  withinTolerance,
} from "../src/services/coachNumericalScorer.js";

// Each case pins a trusted context (numbers only) + a fixture reply.
// expectedFacts must appear in the reply within tolerance; trustedNumbers
// is the full allow-list (reply must not claim anything outside it).
const CASES = [
  {
    id: "income-total-en",
    question: "What was my total income?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "income", value: 50000 }],
    trustedNumbers: [50000, 32000, 18000],
    reply: "Your total income is BDT 50,000 and expenses are BDT 32,000.",
  },
  {
    id: "expense-total-bn",
    question: "আমার মোট খরচ কত?",
    expectedLanguage: "bn",
    expectedFacts: [{ id: "expense", value: 32000 }],
    trustedNumbers: [32000, 50000],
    reply: "আপনার মোট খরচ ৩২০০০ টাকা এবং মোট আয় ৫০০০০ টাকা।",
  },
  {
    id: "net-savings-en",
    question: "How much did I save?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "net", value: 18000 }],
    trustedNumbers: [18000, 50000, 32000],
    reply: "You saved BDT 18,000 (income 50,000 minus expense 32,000).",
  },
  {
    id: "percentage-en",
    question: "What share of income did I spend?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "pct", value: 64 }],
    trustedNumbers: [64, 50000, 32000],
    reply: "You spent 64% of your income.",
  },
  {
    id: "category-food-banglish",
    question: "amar food e koto khoroch hoise?",
    expectedLanguage: "mixed",
    expectedFacts: [{ id: "food", value: 8500 }],
    trustedNumbers: [8500, 32000],
    reply: "Food-te apnar khoroch hoise 8,500 taka, total khoroch 32,000 taka.",
  },
  {
    id: "forecast-amount-risk-en",
    question: "What is next week's forecast?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "outflow", value: 9200 }],
    trustedNumbers: [9200, 20000],
    reply: "Next week outflow BDT 9,200 against inflow BDT 20,000. Risk: high.",
  },
  {
    id: "goal-progress-en",
    question: "How is my Emergency Fund goal going?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "progress", value: 60 }],
    trustedNumbers: [60, 6000, 10000],
    reply: "Emergency Fund is 60% done: saved BDT 6,000 of BDT 10,000.",
  },
  {
    id: "goal-remaining-bn",
    question: "আমার লক্ষ্যের আর কত বাকি?",
    expectedLanguage: "bn",
    expectedFacts: [{ id: "remaining", value: 4000 }],
    trustedNumbers: [4000, 6000, 10000],
    reply: "আপনার লক্ষ্যের আর ৪০০০ টাকা বাকি আছে। ১০০০০ টাকার মধ্যে ৬০০০ টাকা জমেছে।",
  },
  {
    id: "bdt-symbol-bn",
    question: "খাবারে কত খরচ?",
    expectedLanguage: "bn",
    expectedFacts: [{ id: "food", value: 1250 }],
    trustedNumbers: [1250],
    reply: "খাবারে আপনার খরচ ৳১,২৫০।",
  },
  {
    id: "bdt-commas-en",
    question: "Transport total?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "transport", value: 12500 }],
    trustedNumbers: [12500],
    reply: "Transport total is BDT 12,500.",
  },
  {
    id: "rounding-edge-en",
    question: "Savings rate?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "rate", value: 33.33 }],
    trustedNumbers: [33.33],
    customTol: { absTol: 1.0, relTol: 0.005 },
    reply: "Your savings rate is about 33.3%.",
  },
  {
    id: "bengali-digits-bn",
    question: "আয় কত?",
    expectedLanguage: "bn",
    expectedFacts: [{ id: "income", value: 1250 }],
    trustedNumbers: [1250],
    reply: "আপনার আয় ১২৫০ টাকা।",
  },
  {
    id: "banglish-phrasing-mixed",
    question: "amar food e koto khoroch hoise?",
    expectedLanguage: "mixed",
    expectedFacts: [{ id: "food", value: 4200 }],
    trustedNumbers: [4200],
    reply: "Apnar food khoroch 4,200 taka this month.",
  },
  {
    id: "refusal-no-invention",
    question: "What was my March bonus?",
    expectedLanguage: "en",
    expectedFacts: [],
    trustedNumbers: [50000, 32000],
    mustRefuse: true,
    reply:
      "I cannot answer that — your shared summary does not include any bonus figure, so I will not guess one.",
  },
  {
    id: "hallucination-caught",
    question: "What was my total income?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "income", value: 50000 }],
    trustedNumbers: [50000],
    expectFail: true, // scorer MUST reject: 99999 is invented
    reply: "Your total income is BDT 99,999.",
  },
  {
    id: "mixed-reply-banglish",
    question: "ei mashe amar khoroch kothay beshi?",
    expectedLanguage: "mixed",
    expectedFacts: [{ id: "food", value: 8500 }],
    trustedNumbers: [8500, 32000],
    reply: "Ei mashe Food-e sobcheye beshi, 8,500 taka out of 32,000 taka.",
  },
  {
    id: "percent-bangla-word",
    question: "কত শতাংশ জমেছে?",
    expectedLanguage: "bn",
    expectedFacts: [{ id: "pct", value: 60 }],
    trustedNumbers: [60, 6000, 10000],
    reply: "আপনার লক্ষ্যের ৬০ শতাংশ জমেছে। ১০০০০ টাকার মধ্যে ৬০০০ টাকা।",
  },
  {
    id: "forecast-week2-en",
    question: "Week 2 forecast?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "outflow", value: 7800 }],
    trustedNumbers: [7800, 20000],
    reply: "Week 2: inflow BDT 20,000, outflow BDT 7,800. Risk is low.",
  },
  {
    id: "savings-rate-en",
    question: "Savings rate this month?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "rate", value: 36 }],
    trustedNumbers: [36, 18000, 50000],
    reply: "You saved 36% (BDT 18,000 of BDT 50,000 income).",
  },
  {
    id: "wallet-balance-en",
    question: "My wallet balance?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "wallet", value: 12500.5 }],
    trustedNumbers: [12500.5],
    reply: "Your wallet balance is BDT 12,500.50.",
  },
  {
    id: "top-category-en",
    question: "Top spending category?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "food", value: 8500 }],
    trustedNumbers: [8500, 32000],
    reply: "Top category is Food at BDT 8,500 of BDT 32,000 total.",
  },
  {
    id: "tolerance-boundary-en",
    question: "Goal target?",
    expectedLanguage: "en",
    expectedFacts: [{ id: "target", value: 1000 }],
    trustedNumbers: [1000],
    customTol: { absTol: 1.0, relTol: 0.005 },
    reply: "Your goal target is BDT 1,000.40.",
  },
];

test("digit normalization converts Bengali digits", () => {
  assert.equal(normalizeDigits("১২৫০"), "1250");
  assert.equal(normalizeDigits("৳১,২৫০"), "৳1,250");
});

test("extraction handles BDT formats and Bengali digits", () => {
  const vals = extractFinancialNumbers("খরচ ৳১,২৫০ এবং BDT 12,500.50").map(
    (n) => n.value,
  );
  assert.deepEqual(vals, [1250, 12500.5]);
});

test("tolerance accepts rounding edges, rejects inventions", () => {
  assert.equal(withinTolerance(33.3, 33.33, 1.0, 0.005), true);
  assert.equal(withinTolerance(99999, 50000, 1.0, 0.005), false);
});

test("language routing detects bn/en/mixed", () => {
  assert.equal(detectReplyLanguage("আপনার খরচ ৩২০০০ টাকা।"), "bn");
  assert.equal(detectReplyLanguage("Your total is BDT 50,000."), "en");
  assert.equal(detectReplyLanguage("Food-te khoroch 8,500 taka."), "mixed");
});

test("unsupported-claim detector catches invented amounts", () => {
  const bad = findUnsupportedFinancialClaims("Income is BDT 99,999.", [50000]);
  assert.equal(bad.length, 1);
  const good = findUnsupportedFinancialClaims("Income is BDT 50,000.", [50000]);
  assert.equal(good.length, 0);
});

test("all 22 grounding cases score as labelled", () => {
  const evaluated = CASES.map((c) => ({ case: c, result: scoreCase(c.reply, c) }));
  const report = runGroundingEvaluation(evaluated);
  const unexpected = evaluated.filter(
    (e) => e.result.passed === Boolean(e.case.expectFail),
  );
  assert.deepEqual(
    unexpected.map((e) => ({ id: e.case.id, reasons: e.result.reasons })),
    [],
  );
  // Report shape for judges: counts + rates + failures.
  assert.equal(report.casesRun, CASES.length);
  assert.ok(report.numericAccuracy >= 0 && report.numericAccuracy <= 1);
  assert.ok(report.hallucinationRate >= 0 && report.hallucinationRate <= 1);
});

test("report exposes failed-case diagnostics", () => {
  const evaluated = CASES.map((c) => ({ case: c, result: scoreCase(c.reply, c) }));
  const report = runGroundingEvaluation(evaluated);
  // Only the deliberate hallucination case should fail.
  assert.deepEqual(
    report.failedCases.map((f) => f.id),
    ["hallucination-caught"],
  );
  assert.ok(report.failedCases[0].reasons.length > 0);
});
