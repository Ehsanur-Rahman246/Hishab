import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "low_balance",
        "high_spending",
        "cash_flow",
        "budget",
        "savings_goal",
        "unusual_spending",
        "future_shortfall",
        "other",
      ],
      required: true,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    weekStart: {
      type: Date,
      default: null,
    },

    // Deduplication key for machine-generated alerts:
    // user + sourceKey is unique (see index below), so repeated
    // "Refresh insights" never creates duplicates. Human-readable
    // examples: "shortfall:2026-10-12",
    // "anomaly:2026-10-06:shopping:15000.00:laptop-purchase".
    sourceKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },

    // Safe in-app destination (always a relative frontend path).
    actionLink: {
      type: String,
      default: "/ai-assistant",
      trim: true,
      maxlength: 200,
    },

    relatedGoal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
    },

    read: {
      type: Boolean,
      default: false,
    },

    resolved: {
      type: Boolean,
      default: false,
    },

    dedupeKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

alertSchema.index({ user: 1, read: 1, createdAt: -1 });
// Deduplication: one alert per (user, sourceKey). Sparse so legacy alerts
// without a sourceKey are unaffected.
alertSchema.index({ user: 1, sourceKey: 1 }, { unique: true, sparse: true });

alertSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
