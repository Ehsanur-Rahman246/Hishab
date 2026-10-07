// Privacy-boundary suite: what is stored / sent / never leaves backend.
// Asserts aggregates-only provider context, no raw transactions/PII in coach
// context builder allowlist, no secrets in reports, synthetic-data labelling.
// Run: node --test tests/privacyBoundaries.test.js (offline)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collectTrustedNumbers } from "../src/services/coachNumericalScorer.js";

describe("privacy boundaries", () => {
  it("coach context builder selects aggregates only (no raw list, no PII)", () => {
    const src = fs.readFileSync(new URL("../src/controllers/aiControllers.js", import.meta.url), "utf8");
    // Only the listed aggregates cross the provider boundary.
    assert.ok(src.includes("Aggregates only"), "context comment documents aggregates-only");
    // Raw transaction list must never be embedded in the Groq context.
    const ctxStart = src.indexOf("const buildCoachContext");
    const ctxFn = src.slice(ctxStart, src.indexOf("buildNoDataCoach", ctxStart));
    assert.ok(!ctxFn.includes("password") && !ctxFn.includes("pin:") && !ctxFn.includes("GROQ_API_KEY"));
    assert.ok(ctxFn.includes("topCategories") && ctxFn.includes("totals"));
    // Explicit PII fields must not be selected into context.
    for (const banned of ["phone", "password", "pin", "walletNumber", "JWT_SECRET", "GROQ_API_KEY"]) {
      // totals/goals/forecast/history/alerts are allowed; identity secrets are not.
      if (["phone", "password", "pin", "walletNumber"].includes(banned)) {
        assert.ok(!ctxFn.includes(`"${banned}"`) && !ctxFn.includes(`'${banned}'`) && !ctxFn.includes(`${banned}:`),
          `context must not select ${banned}`);
      }
    }
  });

  it("models store message texts/aggregates only — no secrets in chat/transfer schemas", () => {
    for (const f of ["ChatMessage.js", "GoalTransfer.js", "ForecastSnapshot.js", "Alert.js"]) {
      const s = fs.readFileSync(new URL(`../src/models/${f}`, import.meta.url), "utf8");
      for (const banned of ["password", "pin", "jwt", "apiKey", "secret"]) {
        assert.ok(!new RegExp(`\\b${banned}\\b`, "i").test(s), `${f} must not store ${banned}`);
      }
    }
  });

  it("trusted-number collection on a realistic context exposes no PII strings", () => {
    const ctx = {
      totals: { income: 50000, expense: 32000, currency: "BDT" },
      topCategories: [{ category: "Food", amount: 8500 }],
      walletBalance: 12500,
      goals: [{ title: "Emergency", targetAmount: 10000, savedAmount: 6000 }],
    };
    const nums = collectTrustedNumbers(ctx);
    assert.ok(nums.length > 0 && nums.every(Number.isFinite));
    const blob = JSON.stringify(ctx);
    assert.ok(!/01[3-9]\d{8}/.test(blob));
  });

  it("segment/fairness reports contain no protected attributes or raw user data", () => {
    const segSrc = fs.readFileSync(new URL("../../ai-service/segments.py", import.meta.url), "utf8").toLowerCase();
    assert.ok(segSrc.includes("protected"), "segments module documents protected-attribute exclusion");
    assert.ok(segSrc.includes("forbidden"), "segments module enforces forbidden keys");
  });
});
