import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forecastSrc = readFileSync(join(root, "src/pages/Forecast.jsx"), "utf8");
const assistantSrc = readFileSync(join(root, "src/pages/AiAssistant.jsx"), "utf8");
const sectionSrc = readFileSync(
  join(root, "src/components/ai/EvaluationSection.jsx"),
  "utf8",
);

describe("forecast evaluation & reliability UI", () => {
  it("Forecast page renders the evaluation section from snapshot metadata", () => {
    assert.ok(forecastSrc.includes("EvaluationSection"), "Forecast must use EvaluationSection");
    assert.ok(
      forecastSrc.includes("snapshot.evaluation"),
      "Forecast must pass persisted snapshot.evaluation",
    );
    assert.ok(
      forecastSrc.includes("snapshot.patternSignals"),
      "Forecast must pass persisted snapshot.patternSignals",
    );
  });

  it("AI Assistant shows evaluation for live or saved insights", () => {
    assert.ok(assistantSrc.includes("EvaluationSection"), "Assistant must use EvaluationSection");
    assert.ok(
      assistantSrc.includes("mlInsights?.evaluation"),
      "Assistant must prefer fresh live evaluation",
    );
    assert.ok(
      assistantSrc.includes("saved?.evaluation"),
      "Assistant must fall back to saved snapshot evaluation",
    );
  });

  it("section explains in plain words with a not-enough-data state", () => {
    assert.ok(sectionSrc.includes("Not enough history"), "must show the ineligible state");
    assert.ok(sectionSrc.includes("How this was checked"), "must keep the expandable explainer");
    assert.ok(!sectionSrc.includes("heteroskedasticity"), "must not overload users with ML jargon");
  });

  it("section covers train/test dates, model-vs-baseline and salary/festival state", () => {
    assert.ok(sectionSrc.includes("testStart"), "must show the test window");
    assert.ok(sectionSrc.includes("Trend model was closer") || sectionSrc.includes("Simple average"), "must state the winner honestly");
    assert.ok(sectionSrc.includes("Payday pattern"), "must show salary signal state");
    assert.ok(sectionSrc.includes("Festival uplift"), "must show festival signal state");
  });
});
