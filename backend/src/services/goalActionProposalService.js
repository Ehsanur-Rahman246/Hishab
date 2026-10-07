import crypto from "crypto";
import Goal from "../models/Goal.js";
import Wallet from "../models/Wallet.js";
import PendingGoalAction from "../models/PendingGoalAction.js";
import GoalActionAudit from "../models/GoalActionAudit.js";
import { executeManualContribution } from "./goalAutomationService.js";

// Confirmation-token flow for chat-triggered Wallet -> Goal transfers.
//
//   propose (read-only) -> user sees goal, amount, wallet impact + token
//   confirm (token)     -> money moves once via executeManualContribution
//   cancel  (token)     -> proposal discarded, nothing moves
//
// Token properties: random 256-bit, short-lived (10 min), user-bound,
// action-bound (goal+amount+threshold baked into the row and re-validated),
// one-time-use (pending -> confirmed/cancelled transition guarded),
// validated server-side on every confirm (never trust the client).

export const PROPOSAL_TTL_MS = 10 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const codedError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

export const proposeGoalContribution = async ({ userId, goalId, amount, conditionThreshold = null }) => {
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value <= 0) throw codedError("Amount must be greater than 0.", 400);
  if (value > 10000000) throw codedError("Amount is unrealistically large.", 400);

  const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
  if (!goal) throw codedError("Goal not found.", 404);
  if (goal.status !== "active") throw codedError("Savings can only be added to an active goal.", 400);
  const remaining = round2(Number(goal.targetAmount) - Number(goal.savedAmount));
  if (value > remaining) {
    throw codedError(`Amount exceeds the remaining target. Only ${remaining} still needed.`, 400);
  }

  const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
  const balance = round2(Number(wallet?.balance) || 0);
  if (!(balance >= value)) throw codedError("Insufficient wallet balance for this transfer.", 400);

  let threshold = null;
  if (conditionThreshold !== undefined && conditionThreshold !== null && conditionThreshold !== "") {
    threshold = round2(Number(conditionThreshold));
    if (!Number.isFinite(threshold) || threshold < 0) throw codedError("Invalid condition threshold.", 400);
    if (!(balance > threshold)) throw codedError("Wallet-balance condition not met.", 400);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const row = await PendingGoalAction.create({
    user: userId,
    goal: goalId,
    goalTitle: goal.title,
    amount: value,
    conditionThreshold: threshold,
    walletBalanceBefore: balance,
    walletBalanceAfter: round2(balance - value),
    confirmationToken: token,
    status: "pending",
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
  });
  await GoalActionAudit.create({
    user: userId, action: "propose", goalTitle: goal.title, amount: value,
    reason: threshold != null ? `wallet>${threshold}` : null,
  });
  return {
    confirmationToken: token,
    expiresAt: row.expiresAt,
    goal: { _id: String(goal._id), title: goal.title, status: goal.status },
    amount: value,
    conditionThreshold: threshold,
    walletImpact: { before: balance, after: round2(balance - value) },
  };
};

const findPending = async (userId, token) => {
  if (typeof token !== "string" || token.length < 32) throw codedError("A valid confirmation token is required.", 400);
  const row = await PendingGoalAction.findOne({ confirmationToken: token });
  if (!row) throw codedError("Confirmation token is invalid.", 404);
  if (String(row.user) !== String(userId)) throw codedError("Confirmation token does not belong to this user.", 403);
  if (row.status !== "pending") throw codedError("This confirmation was already used.", 409);
  if (row.expiresAt.getTime() <= Date.now()) {
    row.status = "expired";
    await row.save();
    await GoalActionAudit.create({ user: userId, action: "expired", goalTitle: row.goalTitle, amount: row.amount, reason: "token expired" });
    throw codedError("Confirmation token has expired. Please start again.", 410);
  }
  return row;
};

export const confirmGoalContribution = async ({ userId, confirmationToken, idempotencyKey }) => {
  const row = await findPending(userId, confirmationToken);

  // Re-validate everything live: ownership, status, amount, wallet condition.
  // The proposal is a hint; the confirm is the authorisation checkpoint.
  const goal = await Goal.findOne({ _id: row.goal, user: userId });
  if (!goal) {
    row.status = "expired";
    await row.save();
    await GoalActionAudit.create({ user: userId, action: "reject", goalTitle: row.goalTitle, amount: row.amount, reason: "goal_not_found" });
    throw codedError("Goal not found.", 404);
  }
  if (goal.status !== "active") {
    await GoalActionAudit.create({ user: userId, action: "reject", goalTitle: goal.title, amount: row.amount, reason: `status_${goal.status}` });
    throw codedError("Savings can only be added to an active goal.", 400);
  }
  const remaining = round2(Number(goal.targetAmount) - Number(goal.savedAmount));
  if (row.amount > remaining) {
    await GoalActionAudit.create({ user: userId, action: "reject", goalTitle: goal.title, amount: row.amount, reason: "exceeds_remaining" });
    throw codedError(`Amount exceeds the remaining target. Only ${remaining} still needed.`, 400);
  }
  const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
  const balance = round2(Number(wallet?.balance) || 0);
  if (!(balance >= row.amount)) {
    await GoalActionAudit.create({ user: userId, action: "reject", goalTitle: goal.title, amount: row.amount, reason: "insufficient_funds" });
    throw codedError("Insufficient wallet balance for this transfer.", 400);
  }
  if (row.conditionThreshold != null && !(balance > row.conditionThreshold)) {
    await GoalActionAudit.create({ user: userId, action: "reject", goalTitle: goal.title, amount: row.amount, reason: "condition_failed" });
    throw codedError("Wallet-balance condition not met.", 400);
  }

  // One-time-use: claim the row first so concurrent confirms serialize.
  row.status = "confirmed";
  await row.save();

  try {
    const result = await executeManualContribution({
      userId, goalId: String(row.goal), amount: row.amount, idempotencyKey,
    });
    await GoalActionAudit.create({ user: userId, action: "confirm", goalTitle: goal.title, amount: row.amount, reason: null });
    return { proposal: row, result };
  } catch (err) {
    // Money did not move (or idempotent duplicate): keep confirmed state so
    // the token cannot be replayed for a second attempt.
    await GoalActionAudit.create({
      user: userId, action: "reject", goalTitle: goal.title, amount: row.amount,
      reason: String(err?.message || "transfer_failed").slice(0, 200),
    });
    throw err;
  }
};

export const cancelGoalContribution = async ({ userId, confirmationToken }) => {
  const row = await findPending(userId, confirmationToken);
  row.status = "cancelled";
  await row.save();
  await GoalActionAudit.create({ user: userId, action: "cancel", goalTitle: row.goalTitle, amount: row.amount, reason: null });
  return { cancelled: true, goalTitle: row.goalTitle, amount: row.amount };
};
