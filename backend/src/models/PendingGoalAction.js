import mongoose from "mongoose";

// Short-lived, user-bound, action-bound, one-time-use proposal for a
// chat-triggered Wallet -> Goal transfer. Money NEVER moves on creation:
// the row is read-only intent. A separate confirm call validates the token
// server-side (owner, expiry, single-use, live wallet/goal checks) and only
// then runs executeManualContribution. No secrets are stored (no PIN, JWT,
// wallet numbers, API keys).
const pendingGoalActionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: "Goal", required: true, index: true },
    goalTitle: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0.01 },
    conditionThreshold: { type: Number, default: null, min: 0 },
    walletBalanceBefore: { type: Number, required: true, min: 0 },
    walletBalanceAfter: { type: Number, required: true, min: 0 },
    confirmationToken: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

pendingGoalActionSchema.index({ user: 1, status: 1, createdAt: -1 });

const PendingGoalAction = mongoose.model("PendingGoalAction", pendingGoalActionSchema);

export default PendingGoalAction;
