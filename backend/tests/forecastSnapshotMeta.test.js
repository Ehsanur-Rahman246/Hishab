// ForecastSnapshot reliability metadata: schema accepts and keeps the new
// evaluation + patternSignals fields without touching money behaviour.
// Offline (validateSync only — no database needed).
// Run: npm test (node --test tests/*.test.js)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import ForecastSnapshot from "../src/models/ForecastSnapshot.js";

const { ObjectId } = mongoose.Types;

const week = {
  weekStart: new Date("2026-10-12T00:00:00.000Z"),
  predictedInflow: 20000,
  predictedOutflow: 9200,
  predictedBalance: 10800,
  shortfallRisk: "low",
};

describe("ForecastSnapshot evaluation metadata", () => {
  it("accepts eligible evaluation + pattern signals", () => {
    const doc = new ForecastSnapshot({
      user: new ObjectId(),
      modelUsed: "linear_regression",
      horizonWeeks: 4,
      weeks: [week],
      evaluation: {
        splitStrategy: "expanding_window_temporal_split",
        finalHoldoutWeeks: 4,
        trainEnd: "2026-06-22",
        testStart: "2026-06-29",
        testEnd: "2026-07-20",
        eligible: true,
        reason: null,
        linearRegression: { income: { mae: 0, rmse: 0, smape: 0 } },
        historicalAverageBaseline: { income: { mae: 0, rmse: 0, smape: 0 } },
        winner: "linear_regression",
      },
      patternSignals: {
        salaryPatternDetected: true,
        estimatedPaydayDayOfMonth: 28,
        salaryEvidenceCount: 5,
        festivalAdjustmentApplied: false,
        festivalReason: "Not enough prior festival history for this user.",
      },
    });
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.evaluation.winner, "linear_regression");
    assert.equal(doc.patternSignals.salaryPatternDetected, true);
  });

  it("accepts ineligible evaluation and defaults to null", () => {
    const doc = new ForecastSnapshot({
      user: new ObjectId(),
      modelUsed: "historical_average_fallback",
      horizonWeeks: 4,
      weeks: [week],
      evaluation: { eligible: false, winner: "insufficient_data" },
    });
    assert.equal(doc.validateSync(), undefined);
    assert.equal(doc.evaluation.winner, "insufficient_data");
    assert.equal(doc.patternSignals, null);
  });

  it("old snapshots without metadata still validate", () => {
    const doc = new ForecastSnapshot({
      user: new ObjectId(),
      modelUsed: "linear_regression",
      horizonWeeks: 4,
      weeks: [week],
    });
    assert.equal(doc.validateSync(), undefined);
  });
});
