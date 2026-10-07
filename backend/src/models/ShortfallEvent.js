import mongoose from "mongoose";

/**
 * Privacy-safe intervention events. One row per user action.
 * No raw transaction data, no PII, no free-money movement.
 */
const shortfallEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: [
        "plan_shown",
        "plan_accepted",
        "plan_dismissed",
        "action_completed",
        "feedback_useful",
        "feedback_not_useful",
      ],
      required: true,
    },
    language: {
      type: String,
      enum: ["bn", "en", "mixed", "auto"],
      default: "auto",
    },
    // Advisory action title only (never moves money).
    actionRecommended: { type: String, default: null, maxlength: 300 },
    // Optional user-supplied dismissal reason / free text (capped).
    reason: { type: String, default: null, maxlength: 500 },
    feedbackText: { type: String, default: null, maxlength: 1000 },
    // Which part helped most: forecast | expense_explanation |
    // language_wording | suggested_action | none
    featureHelpful: {
      type: String,
      enum: [
        "forecast",
        "expense_explanation",
        "language_wording",
        "suggested_action",
        "none",
      ],
      default: null,
    },
    isSynthetic: { type: Boolean, default: false },
  },
  { timestamps: true },
);

shortfallEventSchema.index({ user: 1, createdAt: -1 });

const ShortfallEvent = mongoose.model("ShortfallEvent", shortfallEventSchema);

export default ShortfallEvent;
