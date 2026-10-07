import mongoose from "mongoose";
import { EXPERIMENT_EVENT_TYPES, VALID_ARMS } from "../services/experimentService.js";

/**
 * Privacy-safe combined-workflow events. One row per user action.
 * Stores user + timestamp + arm/variant + event type + non-sensitive
 * metadata ONLY. Never raw prompt text, raw transactions, PII, secrets,
 * or unnecessary financial detail (metadata is allowlist-sanitized in the
 * controller before saving).
 */
const experimentEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    arm: {
      type: String,
      enum: VALID_ARMS,
      required: true,
    },
    workflowVariant: { type: String, default: null, maxlength: 100 },
    eventType: {
      type: String,
      enum: EXPERIMENT_EVENT_TYPES,
      required: true,
    },
    // Sanitized minimal metadata (e.g. amountBDT, language, goalId, cycleKey).
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Synthetic runs never touch this collection; real-user rows are false.
    isSynthetic: { type: Boolean, default: false },
  },
  { timestamps: true },
);

experimentEventSchema.index({ user: 1, createdAt: -1 });
experimentEventSchema.index({ arm: 1, eventType: 1 });

const ExperimentEvent = mongoose.model("ExperimentEvent", experimentEventSchema);

export default ExperimentEvent;
