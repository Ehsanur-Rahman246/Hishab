import mongoose from "mongoose";
import Goal from "../models/Goal.js";
import GoalTransfer from "../models/GoalTransfer.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import Alert from "../models/Alert.js";

// ---------------------------------------------------------------------------
// Deterministic, LLM-free goal savings automation.
// All money movement happens here through MongoDB transactions. The AI Coach
// only reads compact summaries and can never call these functions.
// Timezone: Asia/Dhaka (UTC+6, no DST).
// ---------------------------------------------------------------------------

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const taka = (n) => `\u09F3${Number(n).toLocaleString("en-BD")}`;

// Dhaka wall-clock parts for an absolute instant (no DST in Bangladesh).
export const dhakaParts = (date = new Date()) => {
  const wall = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
  };
};

export const dhakaDateString = (date = new Date()) => {
  const p = dhakaParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

export const monthlyCycleKeyFor = (date = new Date()) => {
  const p = dhakaParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
};

// ISO-8601 week number computed on the Dhaka wall date: YYYY-Www.
export const weeklyCycleKeyFor = (date = new Date()) => {
  const p = dhakaParts(date);
  // Work purely in UTC on the wall date to avoid host-TZ effects.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

export const currentCycleKeys = (now = new Date()) => ({
  weekly: weeklyCycleKeyFor(now),
  monthly: monthlyCycleKeyFor(now),
  dhakaDate: dhakaDateString(now),
});

// Scheduler helpers: the cycle that just ended.
export const previousWeeklyCycleKey = (now = new Date()) =>
  weeklyCycleKeyFor(new Date(now.getTime() - 24 * 60 * 60 * 1000));

export const previousMonthlyCycleKey = (now = new Date()) => {
  const p = dhakaParts(now);
  const prev = new Date(Date.UTC(p.year, p.month - 2, 1)); // month-1 (0-based -1)
  const y = prev.getUTCFullYear();
  const m = prev.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
};

export const releaseCycleKeyFor = (now = new Date()) =>
  `release-${dhakaDateString(now)}`;

// --- validation ------------------------------------------------------------

export const isValidPercentage = (v) =>
  Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100;

// Fixed allowlist for newly created or updated automations (Part C).
// Legacy goals with other 1–100 percentages keep working in the scheduler
// and are never rewritten; only new/changed values must be in this list.
export const ALLOWED_AUTOMATION_PERCENTAGES = [5, 10, 15, 20, 25];

export const isAllowedAutomationPercentage = (v) =>
  ALLOWED_AUTOMATION_PERCENTAGES.includes(Number(v));

export const isValidPriority = (v) =>
  Number.isInteger(Number(v)) && Number(v) >= 1;

const isTxUnsupportedError = (err) => {
  const msg = String(err?.message || err || "");
  return /transaction|replica set|replicaset|not supported|shard/i.test(msg);
};

const toConfigError = () =>
  new Error(
    "MongoDB replica set is required for safe automatic goal transfers."
  );

// Run fn(session) inside a transaction. Never falls back to non-atomic
// writes: when the deployment cannot do transactions we throw a clear
// configuration error and move nothing.
const withAutomationSession = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTxUnsupportedError(err)) throw toConfigError();
    throw err;
  } finally {
    await session.endSession();
  }
};

const isDuplicateKey = (err) =>
  err?.code === 11000 ||
  String(err?.message || "").includes("duplicate key");

// --- single contribution (one MongoDB transaction) -------------------------
// Scheduler/auto path. Same early-completion rule as manual contributions: a
// contribution that fully funds the goal releases the full savedAmount back
// to the wallet inside this same transaction via the shared release writer.

const executeContribution = async ({ userId, goalId, cycleKey, plannedAmount }) => {
  try {
    return await withAutomationSession(async (session) => {
      const goal = await Goal.findOne({ _id: goalId, user: userId }).session(session);
      if (!goal) return { status: "skipped", reason: "goal_not_found" };
      if (goal.status !== "active") return { status: "skipped", reason: `status_${goal.status}` };
      if (!goal.automation?.enabled || goal.automation?.paused)
        return { status: "skipped", reason: "automation_off" };
      if (goal.automation.lastProcessedCycle === cycleKey)
        return { status: "duplicate", reason: "already_processed" };

      const existing = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "auto_contribution",
        cycleKey,
      })
        .session(session)
        .lean();
      if (existing) {
        await Goal.updateOne(
          { _id: goalId },
          { $set: { "automation.lastProcessedCycle": cycleKey } },
          { session }
        );
        return { status: "duplicate", reason: "ledger_exists" };
      }

      const pct = Number(goal.automation.percentage);
      const planned = round2(plannedAmount);
      if (!Number.isFinite(planned) || planned <= 0)
        return { status: "skipped", reason: "zero_planned" };
      if (!isValidPercentage(pct))
        return { status: "skipped", reason: "invalid_percentage" };

      const remaining = round2(Number(goal.targetAmount) - Number(goal.savedAmount));
      if (remaining <= 0) return { status: "skipped", reason: "target_reached" };
      const amount = round2(Math.min(planned, remaining));
      if (amount <= 0) return { status: "skipped", reason: "zero_contribution" };

      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) return { status: "skipped", reason: "wallet_not_found" };
      if (Number(wallet.balance) < amount)
        return { status: "skipped", reason: "insufficient_funds" };

      const before = round2(Number(wallet.balance));
      const wRes = await Wallet.updateOne(
        { _id: wallet._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { session }
      );
      if (wRes.modifiedCount !== 1)
        return { status: "skipped", reason: "insufficient_funds" };
      const after = round2(before - amount);

      const newSaved = round2(Number(goal.savedAmount) + amount);
      const completes = newSaved >= Number(goal.targetAmount);
      // Conditional write: a concurrent release/delete would otherwise leave
      // a debited wallet with no matching goal credit. Zero matches means the
      // goal changed under us — skip without moving anything.
      const gRes = await Goal.updateOne(
        { _id: goalId, status: "active" },
        {
          $inc: { savedAmount: amount },
          $set: { "automation.lastProcessedCycle": cycleKey },
        },
        { session }
      );
      if (gRes.modifiedCount !== 1)
        return { status: "skipped", reason: "goal_changed" };

      await GoalTransfer.create(
        [
          {
            user: userId,
            goal: goalId,
            type: "auto_contribution",
            amount,
            cycleKey,
            walletBalanceBefore: before,
            walletBalanceAfter: after,
          },
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            user: userId,
            type: "expense",
            category: "Savings",
            amount,
            date: new Date(),
            description: `Automatic savings transfer to goal: ${goal.title}`,
          },
        ],
        { session }
      );

      // Fully funded before the target date: release immediately in this same
      // transaction (never "complete first, release later"). The persisted
      // final state is `released` with completedAt + releasedAt recorded.
      let released = false;
      let releasedAmount = 0;
      if (completes) {
        const rel = await writeGoalReleaseInSession(session, {
          userId,
          goalId,
          title: goal.title,
          releaseAmount: newSaved,
          cycleKey: releaseCycleKeyFor(new Date()),
          releaseMessage: `${taka(newSaved)} from your ${goal.title} goal has been returned to your wallet because you reached the target early.`,
          completedAt: new Date(),
        });
        // Unreachable in practice (a lost claim means a concurrent release
        // committed first, which also aborts this transaction on commit via
        // write-conflict + retry). Abort rather than commit a half-state.
        if (!rel.claimed) {
          const err = new Error("This goal was just released by another process. No money was moved.");
          err.statusCode = 400;
          throw err;
        }
        released = true;
        releasedAmount = rel.releasedAmount;
      }

      return {
        status: "contributed",
        goalId: String(goalId),
        title: goal.title,
        amount,
        cycleKey,
        completed: completes,
        released,
        releasedAmount,
      };
    });
  } catch (err) {
    if (isDuplicateKey(err)) return { status: "duplicate", reason: "ledger_race" };
    throw err;
  }
};

// --- single manual contribution (one MongoDB transaction) --------------------
// Deterministic, LLM-free. Moves money Wallet -> Goal atomically and records
// both the GoalTransfer ledger row (type manual_contribution) and the Savings
// expense Transaction in the SAME session: any failed write aborts all of
// them, so Wallet/Goal/ledger/Transaction can never disagree.
// The requested amount is capped at the remaining target (an overshoot only
// takes what is still needed), so the goal lands exactly on targetAmount.
// When that final contribution fully funds the goal, the SAME transaction
// immediately releases the full savedAmount back to the wallet via the shared
// release writer (status `released`, one goal_release ledger row, one Savings
// income Transaction, one deduplicated alert) — never "complete first,
// release later". A fully funded goal releases immediately, even before
// targetDate, exactly once and atomically.
// Duplicate-safe: callers send a client-generated idempotencyKey; a retry
// with the same key returns the already-created transfer without moving
// money again (pre-check inside the transaction + unique partial index race
// guard + post-race re-fetch).
const codedError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

export const executeManualContribution = async ({ userId, goalId, amount, idempotencyKey }) => {
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value <= 0) {
    throw codedError("Amount must be greater than 0.", 400);
  }
  const cleanKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 100)
      : null;

  // Fast path outside the transaction: an already-processed retry returns
  // its original result without touching balances.
  if (cleanKey) {
    const prior = await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey }).lean();
    if (prior) {
      const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
      return { status: "duplicate", transfer: prior, goal };
    }
  }

  try {
    return await withAutomationSession(async (session) => {
      // Same check inside the transaction so concurrent retries serialize.
      if (cleanKey) {
        const prior = await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey })
          .session(session)
          .lean();
        if (prior) {
          const goal = await Goal.findOne({ _id: goalId, user: userId }).session(session).lean();
          return { status: "duplicate", transfer: prior, goal };
        }
      }

      const goal = await Goal.findOne({ _id: goalId, user: userId }).session(session);
      if (!goal) throw codedError("Goal not found.", 404);
      if (goal.status !== "active")
        throw codedError("Savings can only be added to an active goal.", 400);

      // Cap at the remaining target instead of rejecting: a contribution that
      // would overshoot only takes what is still needed, so the goal lands
      // exactly on targetAmount and the release below returns exactly that.
      const remaining = round2(Number(goal.targetAmount) - Number(goal.savedAmount));
      if (!(remaining > 0))
        throw codedError("This goal is already fully funded. No more savings are needed.", 400);
      const amount = round2(Math.min(value, remaining));
      if (!(amount > 0))
        throw codedError("This goal is already fully funded. No more savings are needed.", 400);

      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) throw codedError("Wallet not found.", 404);
      if (Number(wallet.balance) < amount)
        throw codedError("Insufficient wallet balance for this transfer.", 400);

      const before = round2(Number(wallet.balance));
      const wRes = await Wallet.updateOne(
        { _id: wallet._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { session }
      );
      if (wRes.modifiedCount !== 1)
        throw codedError("Insufficient wallet balance for this transfer.", 400);
      const after = round2(before - amount);

      const newSaved = round2(Number(goal.savedAmount) + amount);
      const completes = newSaved >= Number(goal.targetAmount);
      // Conditional write: a concurrent release/delete would otherwise leave
      // a debited wallet with no matching goal credit. Zero matches means the
      // goal changed under us — abort with no money moved.
      const gRes = await Goal.updateOne(
        { _id: goalId, status: "active" },
        { $inc: { savedAmount: amount } },
        { session }
      );
      if (gRes.modifiedCount !== 1)
        throw codedError(
          "This goal changed while processing (it may have been completed, released, or deleted). Please refresh and try again.",
          400
        );

      // Unique per transfer attempt so the (user, goal, type, cycleKey)
      // index never collides across separate manual transfers. Retried
      // requests reuse the idempotencyKey, and dedup happens through the
      // pre-checks plus the unique partial index on (user, idempotencyKey).
      const cycleKey = `manual:${String(new mongoose.Types.ObjectId())}`;

      const [transfer] = await GoalTransfer.create(
        [
          {
            user: userId,
            goal: goalId,
            type: "manual_contribution",
            amount,
            cycleKey,
            walletBalanceBefore: before,
            walletBalanceAfter: after,
            ...(cleanKey ? { idempotencyKey: cleanKey } : {}),
          },
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            user: userId,
            type: "expense",
            category: "Savings",
            amount,
            date: new Date(),
            description: `Manual savings transfer to goal: ${goal.title}`,
          },
        ],
        { session }
      );

      // Fully funded before the target date: release immediately in this same
      // transaction (never "complete first, release later"). The persisted
      // final state is `released` with completedAt + releasedAt recorded, and
      // automation disabled — exactly one goal_release row, one Savings
      // income transaction, one deduplicated alert.
      let released = false;
      let releasedAmount = 0;
      let walletBalanceAfter = after;
      if (completes) {
        const rel = await writeGoalReleaseInSession(session, {
          userId,
          goalId,
          title: goal.title,
          releaseAmount: newSaved,
          cycleKey: releaseCycleKeyFor(new Date()),
          releaseMessage: `${taka(newSaved)} from your ${goal.title} goal has been returned to your wallet because you reached the target early.`,
          completedAt: new Date(),
        });
        // Unreachable in practice (a lost claim means a concurrent release
        // committed first, which also aborts this transaction on commit via
        // write-conflict + retry). Abort rather than commit a half-state.
        if (!rel.claimed)
          throw codedError("This goal was just released by another process. No money was moved.", 400);
        released = true;
        releasedAmount = rel.releasedAmount;
        walletBalanceAfter = rel.moved ? rel.walletBalanceAfter : after;
      }

      const updatedGoal = await Goal.findOne({ _id: goalId }).session(session).lean();
      return {
        status: "contributed",
        transfer: transfer.toObject(),
        goal: updatedGoal,
        completed: completes,
        released,
        releasedAmount,
        walletBalanceAfter,
      };
    });
  } catch (err) {
    // Lost the index race with a concurrent retry: return the winner's row.
    if (isDuplicateKey(err) && cleanKey) {
      const prior = await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey }).lean();
      if (prior) {
        const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
        return { status: "duplicate", transfer: prior, goal };
      }
    }
    // Lost a same-day release race with the target-date path (this
    // transaction aborted, so it moved nothing): the winner's single release
    // row is the truth — report duplicate, never refund again.
    if (isDuplicateKey(err)) {
      const released = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_release",
      }).lean();
      if (released) {
        const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
        return { status: "duplicate", reason: "already_released", transfer: released, goal };
      }
    }
    throw err;
  }
};

// --- centralized release writer (runs inside the caller's transaction) --------
// Single code path for returning a goal's saved funds to the wallet, shared
// by target-date release and early-completion release so the two can never
// refund the same goal twice.
//
// The caller MUST check (inside the same session, before calling) that the
// goal row is owned by userId, is not cancelled, and has no prior
// goal_release ledger row. This helper then:
//   1. claims the release with a conditional status update
//      ({ status: { $ne: "released" } }) — concurrent releasers serialize:
//      exactly one claim wins; losers see modifiedCount 0 and must NOT move
//      money (their transaction aborts/retries and takes the duplicate path);
//   2. credits the wallet — skipped when releaseAmount is 0, so a
//      zero-balance goal flips status without any fake money movement and
//      without ledger/transaction rows;
//   3. writes exactly one immutable goal_release ledger row (the unique index
//      on (user, goal, type, cycleKey) is the hard backstop) + one matching
//      Savings income Transaction + one deduplicated alert.
// completedAt is set only when provided (early completion records it);
// target-date release preserves the existing value without inventing one.
const writeGoalReleaseInSession = async (
  session,
  { userId, goalId, title, releaseAmount, cycleKey, releaseMessage, completedAt = null }
) => {
  const amount = round2(Number(releaseAmount) || 0);
  const now = new Date();

  const claimSet = {
    status: "released",
    releasedAt: now,
    releasedAmount: amount,
    "automation.enabled": false,
  };
  if (completedAt) claimSet.completedAt = completedAt;

  const claim = await Goal.updateOne(
    { _id: goalId, status: { $ne: "released" } },
    { $set: claimSet },
    { session }
  );
  if (claim.modifiedCount !== 1) return { claimed: false };

  if (!(amount > 0)) {
    // Zero-balance goal: status flip only. No wallet write, no ledger row,
    // no transaction, no alert — never a fake money movement.
    return { claimed: true, moved: false, releasedAmount: 0 };
  }

  const wallet = await Wallet.findOne({ user: userId }).session(session);
  if (!wallet) throw codedError("Wallet not found.", 404);
  const before = round2(Number(wallet.balance));
  await Wallet.updateOne({ _id: wallet._id }, { $inc: { balance: amount } }, { session });
  const after = round2(before + amount);

  const [transfer] = await GoalTransfer.create(
    [
      {
        user: userId,
        goal: goalId,
        type: "goal_release",
        amount,
        cycleKey,
        walletBalanceBefore: before,
        walletBalanceAfter: after,
      },
    ],
    { session }
  );

  await Transaction.create(
    [
      {
        user: userId,
        type: "income",
        category: "Savings",
        amount,
        date: now,
        description: `Goal funds released to wallet: ${title}`,
      },
    ],
    { session }
  );

  // Deduplicated in-app notification (upsert, never twice).
  const alertKey = `goal_release:${String(goalId)}`;
  await Alert.updateOne(
    { user: userId, sourceKey: alertKey },
    {
      $setOnInsert: {
        user: userId,
        type: "savings_goal",
        severity: "medium",
        title: "Goal funds added to wallet",
        message: releaseMessage,
        actionLink: "/goals",
        relatedGoal: goalId,
        sourceKey: alertKey,
        dedupeKey: alertKey,
      },
    },
    { upsert: true, session }
  );

  return {
    claimed: true,
    moved: true,
    releasedAmount: amount,
    walletBalanceAfter: after,
    transfer: transfer.toObject(),
  };
};

// --- single release (one MongoDB transaction) --------------------------------
// Target-date release. Now writes through writeGoalReleaseInSession — the same
// writer the early-completion path uses — so both paths share the claim
// guard, the one-release-ever ledger check, and the alert dedupe key.

const executeRelease = async ({ userId, goalId, now = new Date() }) => {
  try {
    return await withAutomationSession(async (session) => {
      const goal = await Goal.findOne({ _id: goalId, user: userId }).session(session);
      if (!goal) return { status: "skipped", reason: "goal_not_found" };
      if (goal.status === "released" || goal.status === "cancelled")
        return { status: "skipped", reason: `status_${goal.status}` };
      // A goal already refunded via cancellation must never release again.
      // (Deletion hard-removes the goal so this is normally unreachable, but
      // it closes the release-vs-delete race when both run concurrently.)
      const cancelledBefore = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_cancelled_refund",
      })
        .session(session)
        .lean();
      if (cancelledBefore)
        return { status: "duplicate", reason: "already_cancelled_refunded" };
      if (new Date(goal.targetDate).getTime() > now.getTime())
        return { status: "skipped", reason: "not_due" };

      const amount = round2(Number(goal.savedAmount) || 0);
      const cycleKey = releaseCycleKeyFor(now);

      if (!(amount > 0)) {
        // Zero-balance due goal: status flip only, never a money movement.
        const out = await writeGoalReleaseInSession(session, {
          userId,
          goalId,
          title: goal.title,
          releaseAmount: 0,
          cycleKey,
          releaseMessage: "",
          completedAt: goal.completedAt || null,
        });
        if (!out.claimed) return { status: "duplicate", reason: "already_released" };
        return { status: "released", goalId: String(goalId), title: goal.title, amount: 0, cycleKey };
      }

      const dup = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_release",
        cycleKey,
      })
        .session(session)
        .lean();
      if (dup) {
        // A release already returned this money: flip a stale status to match
        // the winning ledger row, move nothing.
        await Goal.updateOne(
          { _id: goalId, status: { $ne: "released" } },
          {
            $set: {
              status: "released",
              releasedAt: dup.createdAt || new Date(),
              releasedAmount: round2(Number(dup.amount) || 0),
              "automation.enabled": false,
            },
          },
          { session }
        );
        return { status: "duplicate", reason: "ledger_exists" };
      }
      // One release ever per goal: another day-key release also blocks.
      const anyRelease = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_release",
      })
        .session(session)
        .lean();
      if (anyRelease) {
        await Goal.updateOne(
          { _id: goalId, status: { $ne: "released" } },
          {
            $set: {
              status: "released",
              releasedAt: anyRelease.createdAt || new Date(),
              releasedAmount: round2(Number(anyRelease.amount) || 0),
              "automation.enabled": false,
            },
          },
          { session }
        );
        return { status: "duplicate", reason: "already_released" };
      }

      const out = await writeGoalReleaseInSession(session, {
        userId,
        goalId,
        title: goal.title,
        releaseAmount: amount,
        cycleKey,
        releaseMessage: `${taka(amount)} from your ${goal.title} goal has been added to your wallet because the target date has arrived.`,
        completedAt: goal.completedAt || null,
      });
      if (!out.claimed) return { status: "duplicate", reason: "already_released" };

      return { status: "released", goalId: String(goalId), title: goal.title, amount, cycleKey };
    });
  } catch (err) {
    if (isDuplicateKey(err)) return { status: "duplicate", reason: "ledger_race" };
    throw err;
  }
};

// --- single goal deletion with refund (one MongoDB transaction) ---------------
// Atomically: Wallet +refund, GoalTransfer (goal_cancelled_refund), Savings
// income Transaction, automation disable, goal delete — all in one session.
// Idempotent: the unique index on (user, goal, type, cycleKey) with
// cycleKey `cancel:<goalId>` guarantees one refund per goal; concurrent or
// retried deletes collapse to { status: "duplicate" }. A retry after the goal
// row is gone returns the original refund instead of 404 (via ledger or
// idempotencyKey lookup), so double-clicks never refund twice. If any step
// fails nothing is partially changed. Released/already-released goals delete
// without a second refund, preventing delete-vs-release double refunds.
export const cancelCycleKeyForGoal = (goalId) => `cancel:${String(goalId)}`;

export const executeGoalDeletion = async ({ userId, goalId, idempotencyKey }) => {
  const cleanKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 100)
      : null;

  // Fast path: explicit retry with the same idempotencyKey returns the
  // original refund without touching balances.
  if (cleanKey) {
    const prior = await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey }).lean();
    if (prior) {
      return {
        status: "duplicate",
        goalId: String(goalId),
        title: prior.goalTitle || undefined,
        refundedAmount: Number(prior.amount) || 0,
        transfer: prior,
      };
    }
  } else {
    // Retry after a successful hard-delete: the goal row is gone but the
    // refund ledger remains. Return it instead of double-refunding.
    const priorCancel = await GoalTransfer.findOne({
      user: userId,
      goal: goalId,
      type: "goal_cancelled_refund",
    }).lean();
    if (priorCancel) {
      const goalStillThere = await Goal.findOne({ _id: goalId, user: userId }).select("_id").lean();
      if (!goalStillThere) {
        return {
          status: "duplicate",
          goalId: String(goalId),
          refundedAmount: Number(priorCancel.amount) || 0,
          transfer: priorCancel,
        };
      }
    }
  }

  try {
    return await withAutomationSession(async (session) => {
      if (cleanKey) {
        const prior = await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey })
          .session(session)
          .lean();
        if (prior) {
          return {
            status: "duplicate",
            goalId: String(goalId),
            refundedAmount: Number(prior.amount) || 0,
            transfer: prior,
          };
        }
      }

      const goal = await Goal.findOne({ _id: goalId, user: userId }).session(session);
      if (!goal) {
        // Goal already gone: if a cancel refund exists, this is a retry.
        const priorCancel = await GoalTransfer.findOne({
          user: userId,
          goal: goalId,
          type: "goal_cancelled_refund",
        })
          .session(session)
          .lean();
        if (priorCancel) {
          return {
            status: "duplicate",
            goalId: String(goalId),
            refundedAmount: Number(priorCancel.amount) || 0,
            transfer: priorCancel,
          };
        }
        const err = new Error("Goal not found.");
        err.statusCode = 404;
        throw err;
      }

      const title = goal.title;
      const amount = round2(Number(goal.savedAmount) || 0);
      const cycleKey = cancelCycleKeyForGoal(goal._id);

      // Already refunded via a previous cancel (e.g. concurrent delete won
      // the race but hasn't removed the row yet): never credit twice.
      const existingCancel = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_cancelled_refund",
      })
        .session(session)
        .lean();
      if (existingCancel) {
        await Goal.deleteOne({ _id: goalId, user: userId }).session(session);
        return {
          status: "duplicate",
          goalId: String(goalId),
          title,
          refundedAmount: Number(existingCancel.amount) || 0,
          transfer: existingCancel,
        };
      }

      // Funds already returned via target-date release: delete without a
      // second refund (closes the delete-vs-release race).
      const existingRelease = await GoalTransfer.findOne({
        user: userId,
        goal: goalId,
        type: "goal_release",
      })
        .session(session)
        .lean();
      if (existingRelease || goal.status === "released") {
        await Goal.deleteOne({ _id: goalId, user: userId }).session(session);
        return { status: "deleted", goalId: String(goalId), title, refundedAmount: 0, alreadyReleased: true };
      }

      if (!(amount > 0)) {
        // Zero-balance goal: no money movement, no ledger/transaction rows.
        await Goal.deleteOne({ _id: goalId, user: userId }).session(session);
        return { status: "deleted", goalId: String(goalId), title, refundedAmount: 0 };
      }

      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) {
        const err = new Error("Wallet not found.");
        err.statusCode = 404;
        throw err;
      }
      const before = round2(Number(wallet.balance));
      await Wallet.updateOne({ _id: wallet._id }, { $inc: { balance: amount } }, { session });
      const after = round2(before + amount);

      const [transfer] = await GoalTransfer.create(
        [
          {
            user: userId,
            goal: goalId,
            type: "goal_cancelled_refund",
            amount,
            cycleKey,
            walletBalanceBefore: before,
            walletBalanceAfter: after,
            ...(cleanKey ? { idempotencyKey: cleanKey } : {}),
          },
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            user: userId,
            type: "income",
            category: "Savings",
            amount,
            date: new Date(),
            description: `Goal cancelled and funds returned to wallet: ${title}`,
          },
        ],
        { session }
      );

      // Deduplicated in-app notification (upsert, never twice).
      const alertKey = `goal_cancel:${String(goalId)}`;
      await Alert.updateOne(
        { user: userId, sourceKey: alertKey },
        {
          $setOnInsert: {
            user: userId,
            type: "savings_goal",
            severity: "medium",
            title: "Goal cancelled — funds returned",
            message: `${taka(amount)} from your ${title} goal has been returned to your wallet.`,
            actionLink: "/goals",
            relatedGoal: goalId,
            sourceKey: alertKey,
            dedupeKey: alertKey,
          },
        },
        { upsert: true, session }
      );

      // Automation dies with the goal: deleting the row guarantees no future
      // contribution or release can ever match it again.
      await Goal.deleteOne({ _id: goalId, user: userId }).session(session);

      return {
        status: "deleted",
        goalId: String(goalId),
        title,
        refundedAmount: amount,
        transfer: transfer.toObject(),
      };
    });
  } catch (err) {
    // Lost the unique-index race with a concurrent delete/retry: return the
    // winner's row instead of refunding again.
    if (isDuplicateKey(err)) {
      const winner = cleanKey
        ? await GoalTransfer.findOne({ user: userId, idempotencyKey: cleanKey }).lean()
        : await GoalTransfer.findOne({ user: userId, goal: goalId, type: "goal_cancelled_refund" }).lean();
      if (winner) {
        return {
          status: "duplicate",
          goalId: String(goalId),
          refundedAmount: Number(winner.amount) || 0,
          transfer: winner,
        };
      }
    }
    throw err;
  }
};

// --- per-user orchestration --------------------------------------------------

// Priority order: ascending priority (1 first), oldest first on ties.
export const processAutoContributionsForUser = async (
  userId,
  { weeklyCycleKey, monthlyCycleKey } = {}
) => {
  const now = new Date();
  const keys = currentCycleKeys(now);
  const weekly = weeklyCycleKey || keys.weekly;
  const monthly = monthlyCycleKey || keys.monthly;

  const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
  if (!wallet) return { weeklyCycleKey: weekly, monthlyCycleKey: monthly, results: [], skipped: "wallet_not_found" };
  const initialBalance = round2(Number(wallet.balance) || 0);

  const goals = await Goal.find({
    user: userId,
    status: "active",
    "automation.enabled": true,
    "automation.paused": { $ne: true },
  })
    .sort({ "automation.priority": 1, createdAt: 1 })
    .lean();

  let available = initialBalance;
  const results = [];

  for (const g of goals) {
    const freq = g.automation?.frequency;
    if (freq !== "weekly" && freq !== "monthly") continue;
    const cycleKey = freq === "weekly" ? weekly : monthly;
    if (g.automation?.lastProcessedCycle === cycleKey) {
      results.push({ goalId: String(g._id), title: g.title, status: "duplicate", reason: "already_processed", cycleKey });
      continue;
    }
    const pct = Number(g.automation?.percentage);
    if (!isValidPercentage(pct)) {
      results.push({ goalId: String(g._id), title: g.title, status: "skipped", reason: "invalid_percentage", cycleKey });
      continue;
    }
    const planned = round2((initialBalance * pct) / 100);
    if (!(planned > 0)) {
      results.push({ goalId: String(g._id), title: g.title, status: "skipped", reason: "zero_planned", cycleKey });
      continue;
    }
    const remaining = round2(Number(g.targetAmount) - Number(g.savedAmount));
    if (remaining <= 0) {
      results.push({ goalId: String(g._id), title: g.title, status: "skipped", reason: "target_reached", cycleKey });
      continue;
    }
    const contribution = round2(Math.min(planned, remaining));
    if (contribution > available) {
      // Skip but do NOT lock the cycle: a later run-now after a top-up
      // within the same cycle may still fund this goal.
      results.push({
        goalId: String(g._id),
        title: g.title,
        status: "skipped",
        reason: "insufficient_funds",
        cycleKey,
        plannedAmount: planned,
        contribution,
        available,
      });
      continue;
    }

    const outcome = await executeContribution({ userId, goalId: g._id, cycleKey, plannedAmount: planned });
    // An early release returns the full saved amount to the wallet, so the
    // planning budget gains it back exactly as the wallet did.
    if (outcome.status === "contributed") available = round2(available - outcome.amount + (Number(outcome.releasedAmount) || 0));
    results.push({ ...outcome, cycleKey, plannedAmount: planned });
  }

  return { weeklyCycleKey: weekly, monthlyCycleKey: monthly, initialWalletBalance: initialBalance, results };
};

export const processReleasesForUser = async (userId, now = new Date()) => {
  const due = await Goal.find({
    user: userId,
    status: { $in: ["active", "paused", "completed"] },
    targetDate: { $lte: now },
  })
    .select("_id")
    .lean();
  const releases = [];
  for (const g of due) {
    const outcome = await executeRelease({ userId, goalId: g._id, now });
    releases.push(outcome);
  }
  return releases;
};

// Demo/test entry point: releases + the currently-due cycle for one user.
export const runDueAutomationForUser = async (userId, now = new Date()) => {
  const walletBefore = await Wallet.findOne({ user: userId }).select("balance").lean();
  const releases = await processReleasesForUser(userId, now);
  const keys = currentCycleKeys(now);
  const contributions = await processAutoContributionsForUser(userId, {
    weeklyCycleKey: keys.weekly,
    monthlyCycleKey: keys.monthly,
  });
  const walletAfter = await Wallet.findOne({ user: userId }).select("balance").lean();
  return {
    dhakaDate: keys.dhakaDate,
    weeklyCycleKey: keys.weekly,
    monthlyCycleKey: keys.monthly,
    walletBalanceBefore: walletBefore ? Number(walletBefore.balance) : null,
    walletBalanceAfter: walletAfter ? Number(walletAfter.balance) : null,
    contributions: contributions.results,
    releases,
  };
};

// --- scheduler (all users) ---------------------------------------------------

const distinctAutomationUsers = async (frequency) => {
  const rows = await Goal.find({
    status: "active",
    "automation.enabled": true,
    "automation.paused": { $ne: true },
    "automation.frequency": frequency,
  })
    .select("user")
    .lean();
  return [...new Set(rows.map((r) => String(r.user)))];
};

export const runWeeklyCycleForAllUsers = async (cycleKey, now = new Date()) => {
  const users = await distinctAutomationUsers("weekly");
  const summary = { cycleKey, processedUsers: 0, contributed: 0, skipped: 0, duplicates: 0, errors: [] };
  for (const uid of users) {
    try {
      const wallet = await Wallet.findOne({ user: uid }).select("balance").lean();
      if (!wallet) continue;
      const initialBalance = round2(Number(wallet.balance) || 0);
      let available = initialBalance;
      const goals = await Goal.find({
        user: uid,
        status: "active",
        "automation.enabled": true,
        "automation.paused": { $ne: true },
        "automation.frequency": "weekly",
      })
        .sort({ "automation.priority": 1, createdAt: 1 })
        .lean();
      summary.processedUsers += 1;
      for (const g of goals) {
        if (g.automation?.lastProcessedCycle === cycleKey) { summary.duplicates += 1; continue; }
        const pct = Number(g.automation?.percentage);
        if (!isValidPercentage(pct)) { summary.skipped += 1; continue; }
        const planned = round2((initialBalance * pct) / 100);
        if (!(planned > 0)) { summary.skipped += 1; continue; }
        const remaining = round2(Number(g.targetAmount) - Number(g.savedAmount));
        if (remaining <= 0) { summary.skipped += 1; continue; }
        const contribution = round2(Math.min(planned, remaining));
        if (contribution > available) { summary.skipped += 1; continue; }
        const outcome = await executeContribution({ userId: uid, goalId: g._id, cycleKey, plannedAmount: planned });
        if (outcome.status === "contributed") { summary.contributed += 1; available = round2(available - outcome.amount + (Number(outcome.releasedAmount) || 0)); }
        else if (outcome.status === "duplicate") summary.duplicates += 1;
        else summary.skipped += 1;
      }
    } catch (err) {
      if (isTxUnsupportedError(err)) throw toConfigError();
      console.error("Weekly automation failed for user:", String(uid).slice(-6), err?.message || err);
      summary.errors.push({ user: String(uid), message: err?.message || "unknown" });
    }
  }
  return summary;
};

export const runMonthlyCycleForAllUsers = async (cycleKey) => {
  const users = await distinctAutomationUsers("monthly");
  const summary = { cycleKey, processedUsers: 0, contributed: 0, skipped: 0, duplicates: 0, errors: [] };
  for (const uid of users) {
    try {
      const wallet = await Wallet.findOne({ user: uid }).select("balance").lean();
      if (!wallet) continue;
      const initialBalance = round2(Number(wallet.balance) || 0);
      let available = initialBalance;
      const goals = await Goal.find({
        user: uid,
        status: "active",
        "automation.enabled": true,
        "automation.paused": { $ne: true },
        "automation.frequency": "monthly",
      })
        .sort({ "automation.priority": 1, createdAt: 1 })
        .lean();
      summary.processedUsers += 1;
      for (const g of goals) {
        if (g.automation?.lastProcessedCycle === cycleKey) { summary.duplicates += 1; continue; }
        const pct = Number(g.automation?.percentage);
        if (!isValidPercentage(pct)) { summary.skipped += 1; continue; }
        const planned = round2((initialBalance * pct) / 100);
        if (!(planned > 0)) { summary.skipped += 1; continue; }
        const remaining = round2(Number(g.targetAmount) - Number(g.savedAmount));
        if (remaining <= 0) { summary.skipped += 1; continue; }
        const contribution = round2(Math.min(planned, remaining));
        if (contribution > available) { summary.skipped += 1; continue; }
        const outcome = await executeContribution({ userId: uid, goalId: g._id, cycleKey, plannedAmount: planned });
        if (outcome.status === "contributed") { summary.contributed += 1; available = round2(available - outcome.amount + (Number(outcome.releasedAmount) || 0)); }
        else if (outcome.status === "duplicate") summary.duplicates += 1;
        else summary.skipped += 1;
      }
    } catch (err) {
      if (isTxUnsupportedError(err)) throw toConfigError();
      console.error("Monthly automation failed for user:", String(uid).slice(-6), err?.message || err);
      summary.errors.push({ user: String(uid), message: err?.message || "unknown" });
    }
  }
  return summary;
};

export const runReleasesForAllUsers = async (now = new Date()) => {
  const due = await Goal.find({
    status: { $in: ["active", "paused", "completed"] },
    targetDate: { $lte: now },
  })
    .select("user")
    .lean();
  const users = [...new Set(due.map((g) => String(g.user)))];
  const summary = { processedUsers: 0, released: 0, duplicates: 0, skipped: 0, errors: [] };
  for (const uid of users) {
    try {
      const releases = await processReleasesForUser(uid, now);
      summary.processedUsers += 1;
      for (const r of releases) {
        if (r.status === "released") summary.released += 1;
        else if (r.status === "duplicate") summary.duplicates += 1;
        else summary.skipped += 1;
      }
    } catch (err) {
      if (isTxUnsupportedError(err)) throw toConfigError();
      console.error("Release failed for user:", String(uid).slice(-6), err?.message || err);
      summary.errors.push({ user: String(uid), message: err?.message || "unknown" });
    }
  }
  return summary;
};
