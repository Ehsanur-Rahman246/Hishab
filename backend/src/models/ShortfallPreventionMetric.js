import mongoose from "mongoose";

/**
 * Privacy-safe per-user aggregate for shortfall-prevention tracking.
 * Stores COUNTS + aggregate BDT values only. Never raw transaction copies.
 */
const shortfallMetricSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Last computed baseline snapshot (aggregate numbers only).
    observedMonths: { type: Number, default: 0 },
    shortfallMonths: { type: Number, default: 0 },
    shortfallRate: { type: Number, default: 0 },
    averageDeficitBDT: { type: Number, default: 0 },
    lastComputedAt: { type: Date, default: null },

    // Intervention funnel (counts only).
    planShownCount: { type: Number, default: 0 },
    planAcceptedCount: { type: Number, default: 0 },
    planDismissedCount: { type: Number, default: 0 },
    actionCompletedCount: { type: Number, default: 0 },
    usefulCount: { type: Number, default: 0 },
    notUsefulCount: { type: Number, default: 0 },
    firstAcceptedPlanAt: { type: Date, default: null },

    // Research consent (explicit, required before feedback storage).
    consentGiven: { type: Boolean, default: false },
    consentAt: { type: Date, default: null },
    preferredLanguage: {
      type: String,
      enum: ["bn", "en", "mixed", "auto"],
      default: "auto",
    },
  },
  { timestamps: true },
);

const ShortfallPreventionMetric = mongoose.model(
  "ShortfallPreventionMetric",
  shortfallMetricSchema,
);

export default ShortfallPreventionMetric;
