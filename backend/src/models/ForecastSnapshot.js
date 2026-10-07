import mongoose from "mongoose";

const weekForecastSchema = new mongoose.Schema(
  {
    weekStart: {
      type: Date,
      required: true,
    },

    predictedInflow: {
      type: Number,
      required: true,
      min: 0,
    },

    predictedOutflow: {
      type: Number,
      required: true,
      min: 0,
    },

    predictedBalance: {
      type: Number,
      required: true,
    },

    shortfallRisk: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },

    actualInflow: {
      type: Number,
      default: null,
      min: 0,
    },

    actualOutflow: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const forecastSnapshotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    modelUsed: {
      type: String,
      required: true,
    },

    horizonWeeks: {
      type: Number,
      required: true,
      min: 1,
    },

    // Honest temporal evaluation (LinearRegression vs historical-average
    // baseline on the final untouched 4-week holdout). Null for snapshots
    // saved before this upgrade. Mixed so the ML service can evolve its
    // metric fields without a migration.
    evaluation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Salary-cycle + festival signal state (evidence-gated, user history
    // only). Null for snapshots saved before this upgrade.
    patternSignals: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Machine-readable forecast benchmark (LinearRegression vs
    // historical-average on the final untouched 4-week holdout, per-series
    // winners). Null for snapshots saved before this upgrade. Mixed so the
    // ML service can evolve its metric fields without a migration.
    forecastEvaluation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    weeks: {
      type: [weekForecastSchema],
      required: true,
      validate: {
        validator: (weeks) => weeks.length > 0,
        message: "At least one forecast week is required.",
      },
    },
  },
  {
    timestamps: true,
  },
);

forecastSnapshotSchema.index({ user: 1, generatedAt: -1 });

const ForecastSnapshot = mongoose.model(
  "ForecastSnapshot",
  forecastSnapshotSchema,
);

export default ForecastSnapshot;
