import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const trustSrc = readFileSync(join(root, "src/components/ai/TrustAndSafety.jsx"), "utf8");
const assistantSrc = readFileSync(join(root, "src/pages/AiAssistant.jsx"), "utf8");
const sectionSrc = readFileSync(join(root, "src/components/ai/EvaluationSection.jsx"), "utf8");
const apiSrc = readFileSync(join(root, "src/api/api.js"), "utf8");

describe("trust & safety UI", () => {
  it("privacy notice states stored/sent/never-sent, retention, synthetic data", () => {
    assert.ok(trustSrc.includes("Stored:"), "must list stored data");
    assert.ok(trustSrc.includes("never raw"), "must state raw data never leaves");
    assert.ok(trustSrc.includes("immutable"), "must state audit immutability");
    assert.ok(trustSrc.includes("synthetic"), "must include synthetic-data statement");
    assert.ok(!/encryption|anonymis|GDPR|compliant/i.test(trustSrc), "must not claim unimplemented guarantees");
    assert.ok(assistantSrc.includes("TrustAndSafety"), "assistant must render the notice");
  });

  it("chat shows Confirm transfer + Cancel for token proposals", () => {
    assert.ok(assistantSrc.includes("Confirm transfer"), "must show Confirm transfer");
    assert.ok(assistantSrc.includes("Cancel"), "must show Cancel");
    assert.ok(assistantSrc.includes("confirmGoalAddMoneyToken"), "must wire token confirm");
    assert.ok(assistantSrc.includes("No money has moved yet"), "must state nothing moved");
  });

  it("evaluation shows confidence, segment, fallback and Review manually", () => {
    assert.ok(sectionSrc.includes("Confidence"), "must label confidence");
    assert.ok(sectionSrc.includes("usage pattern") || sectionSrc.includes("history_length"), "must show segment");
    assert.ok(sectionSrc.includes("Review manually") || sectionSrc.includes("humanReview"), "must show review action");
  });

  it("API client sends double-submit CSRF tokens on mutations", () => {
    assert.ok(apiSrc.includes("x-csrf-token"), "must echo CSRF header");
    assert.ok(apiSrc.includes("/api/auth/csrf-token"), "must mint CSRF tokens");
  });
});
