import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("differentiation UX honesty", () => {
  it("1. landing has a concise Why Hishab section without competitor claims", () => {
    const landing = read("src/pages/Landing.jsx");
    assert.ok(landing.includes("Why Hishab?"), "landing must include the Why Hishab section");
    assert.ok(landing.includes("WhyHishab"), "landing must render the comparison component");
    assert.ok(landing.includes("ExperimentResultsCard"), "landing must render the results card");
    assert.ok(!/better than all competitors/i.test(landing), "must avoid unsupported superiority claims");
  });

  it("2. comparison covers all required rows and the three workflow flows", () => {
    const src = read("src/components/experiment/WhyHishab.jsx");
    for (const row of [
      "Historical analytics",
      "forecast",
      "shortfall",
      "Bangla",
      "One prioritized action",
      "Safety check",
      "confirmation",
      "Outcome tracking",
    ]) {
      assert.ok(src.includes(row), `comparison must cover: ${row}`);
    }
    assert.ok(src.includes("Past transactions"), "workflow visual must start from past transactions");
    assert.ok(src.includes("user decides alone"), "standard flow must end with user decides alone");
    assert.ok(src.includes("fixed savings percentage"), "rule-based flow must show the fixed percentage");
    assert.ok(src.includes("confirmed savings contribution"), "hishab flow must show confirmed contribution");
    assert.ok(src.includes("outcome tracking"), "hishab flow must end with outcome tracking");
    assert.ok(
      src.includes("no commercial product is named") || src.includes("Generic product categories"),
      "must disclaim generic categories only",
    );
  });

  it("3. results card is labelled synthetic and states insufficient evidence", () => {
    const src = read("src/components/experiment/ExperimentResultsCard.jsx");
    assert.ok(src.includes("Synthetic workflow validation"), "card must carry the synthetic label");
    assert.ok(src.includes("not real-user impact"), "card must state results are not real-user impact");
    assert.ok(src.includes("insufficient evidence"), "card must state insufficient evidence");
    assert.ok(src.includes("no winner declared"), "card must not declare a winner");
    assert.ok(src.includes("Shortfall-event rate"), "card must show shortfall-event rate");
    assert.ok(src.includes("Savings adherence"), "card must show savings adherence");
    assert.ok(src.includes("Unsafe suggestion rate"), "card must show the safety differentiation");
  });

  it("4. card fallback values match the deterministic backend simulation", () => {
    const src = read("src/components/experiment/ExperimentResultsCard.jsx");
    // Backend hand-verified values: adherence null/0.333/1, shortfall 0.5,
    // goal 0.333, completed contributions 0/0.333/0.667, unsafe null/0.333/0.
    assert.ok(src.includes("avgSavingsAdherenceValue: 0.333"), "fallback must include rule-based adherence");
    assert.ok(src.includes("avgSavingsAdherenceValue: 1,"), "fallback must include hishab adherence");
    assert.ok(src.includes("shortfallEventRateValue: 0.5"), "fallback must include shortfall rate");
    assert.ok(src.includes("completedContributionRate: 0.667"), "fallback must include hishab completion rate");
    assert.ok(src.includes("unsafeSuggestionRate: 0.333"), "fallback must include rule-based unsafe rate");
  });

  it("5. experiment api client covers arms, events, synthetic results, outcomes", () => {
    const src = read("src/api/experimentApi.js");
    assert.ok(src.includes("/api/experiments/arms"));
    assert.ok(src.includes("/api/experiments/events"));
    assert.ok(src.includes("/api/experiments/synthetic-results"));
    assert.ok(src.includes("/api/experiments/outcomes"));
  });
});
