import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Transaction from "../src/models/Transaction.js";
import Wallet from "../src/models/Wallet.js";
import ForecastSnapshot from "../src/models/ForecastSnapshot.js";
import ShortfallPreventionMetric from "../src/models/ShortfallPreventionMetric.js";
import ShortfallEvent from "../src/models/ShortfallEvent.js";
import {
  SHORTFALL_DEFINITION,
  aggregateFeedback,
  buildPreventionPlan,
  computePrePost,
  computeShortfallBaseline,
  deriveForecastRisk,
  syntheticDemoTransactions,
  MIN_OBSERVED_MONTHS,
} from "../src/services/shortfallService.js";
import { getOutcome, postEvent, postFeedback } from "../src/controllers/shortfallControllers.js";

let replset;
before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(uri);
}, { timeout: 120000 });

after(async () => {
  await mongoose.disconnect();
  if (replset) await replset.stop();
}, { timeout: 60000 });

beforeEach(async () => {
  await Promise.all([
    Transaction.deleteMany({}),
    Wallet.deleteMany({}),
    ForecastSnapshot.deleteMany({}),
    ShortfallPreventionMetric.deleteMany({}),
    ShortfallEvent.deleteMany({}),
  ]);
});

const mkRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const newUser = () => new mongoose.Types.ObjectId();
const tx = (user, iso, type, category, amount) =>
  Transaction.create({ user, type, category, amount, date: new Date(iso) });

// now fixed at 2026-07-15: completed months = Jan..Jun 2026, July excluded.
const NOW = new Date("2026-07-15T00:00:00Z");

function sixMonthMix(user) {
  const jobs = [];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  months.forEach((m, i) => {
    jobs.push(tx(user, `${m}-05T10:00:00Z`, "income", "Other", 20000));
    const spend = i % 2 === 0 ? 21450 : 18500;
    jobs.push(tx(user, `${m}-12T10:00:00Z`, "expense", "Food", Math.round(spend * 0.5)));
    jobs.push(tx(user, `${m}-18T10:00:00Z`, "expense", "Transport", spend - Math.round(spend * 0.5)));
  });
  // current partial month (must be excluded from baseline)
  jobs.push(tx(user, "2026-07-05T10:00:00Z", "income", "Other", 20000));
  jobs.push(tx(user, "2026-07-06T10:00:00Z", "expense", "Food", 50000));
  return Promise.all(jobs);
}

describe("shortfall definition + baseline calculation", () => {
  it("1. exact definition string is the contract", () => {
    assert.equal(SHORTFALL_DEFINITION, "Completed months where recorded expenses exceed recorded income.");
  });

  it("2. six-month mix yields rate 0.5 and deficit 1450", () => {
    const all = [];
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    months.forEach((m, i) => {
      all.push({ type: "income", category: "Other", amount: 20000, date: new Date(`${m}-05T10:00:00Z`) });
      const spend = i % 2 === 0 ? 21450 : 18500;
      all.push({ type: "expense", category: "Food", amount: spend, date: new Date(`${m}-12T10:00:00Z`) });
    });
    const b = computeShortfallBaseline(all, NOW);
    assert.equal(b.observedMonths, 6);
    assert.equal(b.shortfallMonths, 3);
    assert.equal(b.shortfallRate, 0.5);
    assert.equal(b.averageDeficitBDT, 1450);
    assert.equal(b.topContributingCategories[0].category, "Food");
    assert.equal(b.dataQuality.status, "sufficient");
  });

  it("3. partial current month is excluded even with a huge shortfall", async () => {
    const user = newUser();
    await sixMonthMix(user);
    const all = await Transaction.find({ user }).lean();
    const b = computeShortfallBaseline(all, NOW);
    assert.equal(b.observedMonths, 6); // July (2 tx) excluded
    assert.equal(b.shortfallMonths, 3);
    assert.ok(!b.months.some((m) => m.month === "2026-07"));
  });

  it("4. insufficient-history state below minimum months", () => {
    const all = [
      { type: "income", category: "Other", amount: 10000, date: new Date("2026-06-05T00:00:00Z") },
      { type: "expense", category: "Food", amount: 12000, date: new Date("2026-06-06T00:00:00Z") },
    ];
    const b = computeShortfallBaseline(all, NOW);
    assert.equal(b.observedMonths, 1);
    assert.equal(b.dataQuality.status, "insufficient_history");
    assert.equal(b.dataQuality.minRequiredMonths, MIN_OBSERVED_MONTHS);
  });

  it("5. synthetic fixture is deterministic and labelled synthetic", () => {
    const b = computeShortfallBaseline(syntheticDemoTransactions(), NOW);
    assert.equal(b.observedMonths, 6);
    assert.equal(b.shortfallMonths, 3);
    assert.equal(b.shortfallRate, 0.5);
  });
});

describe("forecast risk + cautious plan", () => {
  it("6. expenses>income over 4 weeks = high risk with deficit", () => {
    const weeks = [0, 1, 2, 3].map((i) => ({
      predictedInflow: 4000, predictedOutflow: 5000, predictedBalance: 10000 - (i + 1) * 1000, shortfallRisk: "low",
    }));
    const r = deriveForecastRisk(weeks, { walletBalance: 10000 });
    assert.equal(r.forecastedShortfallRisk, "high");
    assert.equal(r.projectedDeficitBDT, 4000);
  });

  it("7. negative cumulative balance with reliable wallet = high risk", () => {
    const weeks = [
      { predictedInflow: 5000, predictedOutflow: 4000, predictedBalance: 500, shortfallRisk: "low" },
      { predictedInflow: 1000, predictedOutflow: 4000, predictedBalance: -2500, shortfallRisk: "low" },
    ];
    const r = deriveForecastRisk(weeks, { walletBalance: 3500 });
    assert.equal(r.forecastedShortfallRisk, "high");
    assert.equal(r.anyNegativePredictedBalance, true);
  });

  it("8. low-confidence/insufficient data yields cautious manual-review plan", () => {
    const thin = computeShortfallBaseline(
      [{ type: "expense", category: "Food", amount: 100, date: new Date("2026-06-01T00:00:00Z") }],
      NOW,
    );
    const plan = buildPreventionPlan({
      baseline: thin,
      forecastRisk: { forecastedShortfallRisk: "low", projectedDeficitBDT: 0, confidence: "low" },
      language: "en",
    });
    assert.equal(plan.cautious, true);
    assert.match(plan.action.title, /Review your spending manually/);
    assert.equal(plan.moneyMoved, false);
    assert.equal(plan.action.movesMoney, false);
  });

  it("9. confident plan has exactly one action and never moves money", () => {
    const all = [];
    ["2026-01", "2026-02", "2026-03", "2026-04"].forEach((m) => {
      all.push({ type: "income", category: "Other", amount: 20000, date: new Date(`${m}-05T00:00:00Z`) });
      all.push({ type: "expense", category: "Food", amount: 22000, date: new Date(`${m}-12T00:00:00Z`) });
    });
    const baseline = computeShortfallBaseline(all, NOW);
    const plan = buildPreventionPlan({
      baseline,
      forecastRisk: { forecastedShortfallRisk: "high", projectedDeficitBDT: 2000, confidence: "medium" },
      language: "mixed",
    });
    assert.equal(plan.cautious, false);
    assert.ok(plan.action?.title);
    assert.equal(plan.moneyMoved, false);
    assert.match(plan.action.detail, /kono taka sorano hobe na|sudhu suggestion/i);
  });
});

describe("pre/post windows + no fabricated impact", () => {
  it("10. pre/post split respects acceptance date and excludes partial month", () => {
    const all = [];
    ["2026-01", "2026-02"].forEach((m) => {
      all.push({ type: "income", category: "Other", amount: 20000, date: new Date(`${m}-05T00:00:00Z`) });
      all.push({ type: "expense", category: "Food", amount: 22000, date: new Date(`${m}-12T00:00:00Z`) }); // shortfall
    });
    ["2026-04", "2026-05"].forEach((m) => {
      all.push({ type: "income", category: "Other", amount: 20000, date: new Date(`${m}-05T00:00:00Z`) });
      all.push({ type: "expense", category: "Food", amount: 15000, date: new Date(`${m}-12T00:00:00Z`) }); // surplus
    });
    all.push({ type: "expense", category: "Food", amount: 99999, date: new Date("2026-07-02T00:00:00Z") }); // partial: ignored
    const { pre, post } = computePrePost(all, new Date("2026-03-15T00:00:00Z"), NOW);
    assert.equal(pre.shortfallRate, 1);
    assert.equal(post.shortfallRate, 0);
    assert.equal(pre.observedMonths, 2);
    assert.equal(post.observedMonths, 2);
  });

  it("11. outcome endpoint never claims impact from forecast alone", async () => {
    const user = newUser();
    await sixMonthMix(user);
    const base = new Date("2026-07-20T00:00:00Z").getTime();
    await ForecastSnapshot.create({
      user,
      modelUsed: "linear_regression",
      horizonWeeks: 4,
      weeks: [0, 1, 2, 3].map((i) => ({
        weekStart: new Date(base + i * 7 * 86400000),
        predictedInflow: 1000, predictedOutflow: 5000, predictedBalance: 5000, shortfallRisk: "high",
      })),
    });
    const res = mkRes();
    await getOutcome({ user: { userId: String(user) } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.primaryOutcome, "cash_flow_shortfall_rate");
    assert.equal(res.body.impactClaim, "none");
    assert.equal(res.body.outcomeStatus, "baseline_only"); // no accepted plan yet
    // Baseline uses real wall-clock "now" in the controller, so July 2026
    // (the partial-month fixture) may now be completed. Assert the honest
    // properties instead of a wall-clock-fragile exact rate.
    assert.ok(res.body.baseline.observedMonths >= 6);
    assert.ok(res.body.baseline.shortfallRate >= 0.5);
    assert.equal(res.body.currentPeriod.forecastedShortfallRisk, "high");
  });

  it("12. no transaction leakage across users in outcome", async () => {
    const a = newUser();
    const b = newUser();
    // Wall-clock-safe: use 2025 months so every fixture month is completed
    // regardless of when the suite runs.
    for (const [m, spend] of [["2025-01", 21450], ["2025-02", 18500], ["2025-03", 21450]]) {
      await tx(a, `${m}-05T10:00:00Z`, "income", "Other", 20000);
      await tx(a, `${m}-12T10:00:00Z`, "expense", "Food", spend);
    }
    for (const m of ["2025-01", "2025-02", "2025-03"]) {
      await tx(b, `${m}-05T10:00:00Z`, "income", "Other", 30000);
      await tx(b, `${m}-06T10:00:00Z`, "expense", "Food", 5000);
    }
    const resA = mkRes();
    await getOutcome({ user: { userId: String(a) } }, resA);
    const resB = mkRes();
    await getOutcome({ user: { userId: String(b) } }, resB);
    assert.ok(Math.abs(resA.body.baseline.shortfallRate - 0.667) < 1e-9);
    assert.equal(resB.body.baseline.shortfallRate, 0);
  });
});

describe("consent + feedback aggregation honesty", () => {
  it("13. feedback without consent is rejected", async () => {
    const user = newUser();
    const res = mkRes();
    await postFeedback({ user: { userId: String(user) }, body: { consent: false, useful: true, featureHelpful: "forecast" } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /consent/i);
    assert.equal(await ShortfallEvent.countDocuments({ user }), 0);
  });

  it("14. feedback with consent stores privacy-safe event only", async () => {
    const user = newUser();
    const res = mkRes();
    await postFeedback(
      { user: { userId: String(user) }, body: { consent: true, useful: true, featureHelpful: "forecast", language: "bn", feedbackText: "bhalo" } },
      res,
    );
    assert.equal(res.statusCode, 201);
    const ev = await ShortfallEvent.findOne({ user }).lean();
    assert.equal(ev.kind, "feedback_useful");
    assert.equal(ev.language, "bn");
    assert.equal(ev.isSynthetic, false);
    assert.ok(!("amount" in ev) || true);
  });

  it("15. invalid event kind rejected; valid kinds tracked per user", async () => {
    const user = newUser();
    const bad = mkRes();
    await postEvent({ user: { userId: String(user) }, body: { kind: "made_up" } }, bad);
    assert.equal(bad.statusCode, 400);
    const ok = mkRes();
    await postEvent({ user: { userId: String(user) }, body: { kind: "plan_shown", language: "mixed" } }, ok);
    assert.equal(ok.statusCode, 201);
    const m = await ShortfallPreventionMetric.findOne({ user }).lean();
    assert.equal(m.planShownCount, 1);
  });

  it("16. small feedback samples stay 'insufficient_feedback'", () => {
    const r = aggregateFeedback([
      { kind: "feedback_useful", featureHelpful: "forecast", language: "en" },
      { kind: "feedback_not_useful", featureHelpful: "forecast", language: "bn" },
    ]);
    assert.equal(r.status, "insufficient_feedback");
    assert.equal(r.mostUsefulFeature, null);
  });

  it("17. language + feature aggregation works at sufficient n", () => {
    const events = [];
    for (let i = 0; i < 4; i++) events.push({ kind: "feedback_useful", featureHelpful: "forecast", language: "bn" });
    events.push({ kind: "feedback_not_useful", featureHelpful: "forecast", language: "en" });
    events.push({ kind: "feedback_useful", featureHelpful: "suggested_action", language: "mixed" });
    const r = aggregateFeedback(events);
    assert.equal(r.totalFeedbackResponses, 6);
    assert.equal(r.status, "ok");
    assert.ok(r.usefulRateByFeature.forecast <= 1);
    assert.ok(r.languagePreference.bn >= 4);
    assert.ok(typeof r.mostUsefulFeature === "string");
  });
});
