import mongoose from "mongoose";

// Immutable audit ledger for every automatic Wallet <-> Goal money movement.
// Rows are never updated or auto-deleted. The unique compound index on
// (user, goal, type, cycleKey) is the hard duplicate guard: scheduler
// restarts, endpoint retries, and multiple server instances cannot deduct
// twice for the same cycle.
const goalTransferSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    goal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["auto_contribution", "goal_release", "manual_contribution", "goal_cancelled_refund"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    cycleKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    walletBalanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    walletBalanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    // Client-generated UUID sent with manual add-savings requests. A retry
    // with the same key returns the original transfer instead of deducting
    // the wallet again. Absent on automatic transfers (they dedupe by
    // cycleKey instead), so the index below is sparse.
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 100,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

goalTransferSchema.index(
  { user: 1, goal: 1, type: 1, cycleKey: 1 },
  { unique: true },
);
goalTransferSchema.index({ user: 1, createdAt: -1 });
goalTransferSchema.index(
  { user: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  },
);

const GoalTransfer = mongoose.model("GoalTransfer", goalTransferSchema);

export default GoalTransfer;
