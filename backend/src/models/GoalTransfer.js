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
    // cycleKey instead). The partial index below covers only string keys, so
    // keyless rows (auto contributions, releases, most manual rows) never
    // collide with each other — only a repeated key is rejected.
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
// Partial (not sparse): a compound sparse index still indexes every row here
// because `user` is always present, which made any two keyless rows for one
// user collide. Only string idempotency keys are indexed, so keyless ledger
// rows never collide while repeated keys are still rejected exactly once.
goalTransferSchema.index(
  { user: 1, idempotencyKey: 1 },
<<<<<<< HEAD
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  },
=======
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
>>>>>>> 381a66cc80bf0087bf6d4272e724beeb27eeed7d
);

const GoalTransfer = mongoose.model("GoalTransfer", goalTransferSchema);

export default GoalTransfer;
