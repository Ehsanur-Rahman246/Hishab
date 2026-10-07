import mongoose from "mongoose";

// Audit trail for goal-action proposals (propose / confirm / cancel / reject).
// Stores outcomes only: user, action, goal title, amount, reason. NEVER stores
// secrets (no confirmation tokens, PINs, JWTs, wallet numbers, API keys).
const goalActionAuditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: {
      type: String,
      enum: ["propose", "confirm", "cancel", "reject", "expired"],
      required: true,
    },
    goalTitle: { type: String, default: null, trim: true, maxlength: 200 },
    amount: { type: Number, default: null, min: 0 },
    reason: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

goalActionAuditSchema.index({ user: 1, createdAt: -1 });

const GoalActionAudit = mongoose.model("GoalActionAudit", goalActionAuditSchema);

export default GoalActionAudit;
