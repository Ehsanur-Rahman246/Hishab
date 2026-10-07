import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const DEFINITION = "Completed months where recorded expenses exceed recorded income";

describe("shortfall UX honesty", () => {
  it("1. progress card shows the exact baseline definition", () => {
    const src = read("src/components/shortfall/ShortfallProgressCard.jsx");
    assert.ok(src.includes(DEFINITION), "progress card must show the exact metric definition");
    assert.ok(src.includes("insufficient"), "must handle insufficient-history state");
    assert.ok(src.includes("Current partial month") || src.includes("partial month"), "must note partial-month exclusion");
  });

  it("2. plan card is advisory-only and consent-gated", () => {
    const src = read("src/components/shortfall/ShortfallPlanCard.jsx");
    assert.ok(src.includes("never moves money"), "plan must state it never moves money");
    assert.ok(src.includes("Was this useful?"), "must include usefulness feedback");
    assert.ok(src.includes("Which part helped most?"), "must include most-useful-feature question");
    assert.ok(src.includes("consent"), "must include consent notice");
    assert.ok(src.includes("Skip"), "must offer a skip option");
    assert.ok(
      src.includes("forecast") && src.includes("expense_explanation") && src.includes("suggested_action"),
      "must offer forecast / explanation / action / none options",
    );
  });

  it("3. prevention plan renders first on Forecast and AI Assistant", () => {
    const forecast = read("src/pages/Forecast.jsx");
    const ai = read("src/pages/AiAssistant.jsx");
    assert.ok(forecast.includes("ShortfallPlanCard"), "Forecast must render the prevention plan");
    assert.ok(forecast.includes("ShortfallProgressCard"), "Forecast must render progress");
    assert.ok(ai.includes("<ShortfallPlanCard"), "AI Assistant must render the prevention plan");
    const planIdx = ai.indexOf("<ShortfallPlanCard");
    const riskIdx = ai.indexOf("<OverallRiskCard");
    assert.ok(planIdx !== -1 && riskIdx !== -1 && planIdx < riskIdx, "plan must come before generic risk card");
  });

  it("4. goals/zakat stay secondary to shortfall prevention", () => {
    const forecast = read("src/pages/Forecast.jsx");
    assert.ok(
      forecast.includes("supportive") || forecast.includes("after shortfall risk"),
      "goals card must be labelled supportive/secondary",
    );
  });

  it("5. feedback report refuses to rank small samples", () => {
    const src = read("src/components/shortfall/FeedbackPriorityReport.jsx");
    assert.ok(src.includes("Insufficient feedback"), "must show insufficient-feedback state");
    assert.ok(src.includes("no qualitative claims") || src.includes("pending"), "must not overstate preferences");
  });

  it("6. dashboard leads with the primary outcome", () => {
    const src = read("src/pages/Dashboard.jsx");
    assert.ok(src.includes("ShortfallProgressCard"), "Dashboard must lead with shortfall progress");
    const progressIdx = src.indexOf("ShortfallProgressCard");
    const figuresIdx = src.indexOf("Key figures");
    assert.ok(progressIdx !== -1 && figuresIdx !== -1 && progressIdx < figuresIdx, "progress must precede generic figures");
  });
});
