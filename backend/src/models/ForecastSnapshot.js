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
