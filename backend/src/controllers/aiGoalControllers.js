import mongoose from "mongoose";
import ChatMessage from "../models/ChatMessage.js";
import Wallet from "../models/Wallet.js";
import { executeGoalDeletion, executeManualContribution } from "../services/goalAutomationService.js";
import {
  addMoneyAmbiguousReply,
  addMoneyConditionFailedReply,
  addMoneyFailedReply,
  addMoneyInactiveGoalReply,
  addMoneyNeedAmountReply,
  addMoneyNotFoundReply,
  addedReply,
  addedEarlyReleaseReply,
  ambiguousReply,
  confirmPromptReply,
  deletedReply,
  extractGoalTitleHint,
  fetchUserGoalsForChat,
  isDeleteConfirmationMessage,
  isGoalDeleteMessage,
  notFoundReply,
  parseGoalAddMoneyIntent,
  resolveGoalFromHint,
} from "../services/aiGoalActionService.js";
import { COACH_REQUEST_LANGUAGES } from "../services/groqCoachService.js";

const cleanLanguage = (raw) => {
  const v = raw === undefined ? "auto" : String(raw).trim().toLowerCase();
  return COACH_REQUEST_LANGUAGES.includes(v) ? v : "auto";
};

const publicGoal = (g) => ({
  _id: String(g._id),
  title: g.title,
  savedAmount: Number(g.savedAmount) || 0,
  targetAmount: Number(g.targetAmount) || 0,
  status: g.status,
});

// POST /api/ai/goals/delete-request — propose, never delete.
// Body: { message, language? }. Always scoped to the JWT user.
export const requestGoalDelete = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message: rawMessage, language: rawLanguage } = req.body ?? {};
    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }
    const message = rawMessage.trim();
    if (message.length > 500) {
      return res.status(400).json({ success: false, message: "Message must be at most 500 characters." });
    }
    const language = cleanLanguage(rawLanguage);

    if (!isGoalDeleteMessage(message)) {
      return res.status(200).json({ success: true, action: "none", reply: null });
    }

    const goals = await fetchUserGoalsForChat(userId);
    const hint = extractGoalTitleHint(message);
    const resolved = resolveGoalFromHint(goals, hint);

    if (resolved.kind === "single") {
      const reply = confirmPromptReply(resolved.goal, language);
      await ChatMessage.create({ user: userId, role: "user", text: message });
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return res.status(200).json({
        success: true,
        action: "confirm_required",
        goal: publicGoal(resolved.goal),
        reply,
      });
    }
    if (resolved.kind === "ambiguous") {
      const reply = ambiguousReply(resolved.matches, language);
      await ChatMessage.create({ user: userId, role: "user", text: message });
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return res.status(200).json({
        success: true,
        action: "ambiguous",
        matches: resolved.matches.map(publicGoal),
        reply,
      });
    }
    const reply = notFoundReply(hint, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return res.status(200).json({ success: true, action: "not_found", reply });
  } catch (error) {
    console.error("AI delete-request failed:", error?.message || error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/ai/goals/delete-confirm — destructive, explicit confirmation only.
// Body: { goalId, language? }. Uses the shared executeGoalDeletion service.
export const confirmGoalDelete = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalId: rawId, language: rawLanguage } = req.body ?? {};
    const language = cleanLanguage(rawLanguage);

    if (typeof rawId !== "string" || !mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ success: false, message: "A valid goalId is required to confirm deletion." });
    }

    let result;
    try {
      result = await executeGoalDeletion({ userId, goalId: rawId });
    } catch (err) {
      if (err?.statusCode === 404) {
        return res.status(404).json({ success: false, message: "Goal not found." });
      }
      if (String(err?.message || "").includes("replica set")) {
        return res.status(503).json({ success: false, message: err.message });
      }
      throw err;
    }

    if (result.status === "duplicate") {
      const title = result.title || "goal";
      const reply = deletedReply(title, result.refundedAmount, language);
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return res.status(200).json({
        success: true,
        duplicate: true,
        goalTitle: title,
        refundedAmount: result.refundedAmount,
        reply,
      });
    }

    const reply = deletedReply(result.title, result.refundedAmount, language);
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return res.status(200).json({
      success: true,
      goalTitle: result.title,
      refundedAmount: result.refundedAmount,
      reply,
    });
  } catch (error) {
    console.error("AI delete-confirm failed:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "Could not delete the goal. No money was moved. Please try again.",
    });
  }
};

// Shared helper for the coach endpoint: handles "Yes, delete X" confirmations
// typed directly into chat. Returns null when the message is not a goal-delete
// message; otherwise resolves safely and (only on explicit confirmation with a
// single match) deletes via the shared service. Never lets the LLM pick IDs.
export const handleCoachGoalDeleteMessage = async ({ userId, message, language }) => {
  if (!isGoalDeleteMessage(message)) return null;
  const goals = await fetchUserGoalsForChat(userId);
  const hint = extractGoalTitleHint(message);
  const resolved = resolveGoalFromHint(goals, hint);

  if (!isDeleteConfirmationMessage(message)) {
    // Proposal step: never delete.
    if (resolved.kind === "single") {
      const reply = confirmPromptReply(resolved.goal, language);
      await ChatMessage.create({ user: userId, role: "user", text: message });
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return {
        handled: true,
        deleted: false,
        action: "confirm_required",
        goal: publicGoal(resolved.goal),
        reply,
      };
    }
    if (resolved.kind === "ambiguous") {
      const reply = ambiguousReply(resolved.matches, language);
      await ChatMessage.create({ user: userId, role: "user", text: message });
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return { handled: true, deleted: false, action: "ambiguous", matches: resolved.matches.map(publicGoal), reply };
    }
    const reply = notFoundReply(hint, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, deleted: false, action: "not_found", reply };
  }

  // Explicit confirmation step: single match deletes via shared service.
  if (resolved.kind === "single") {
    const result = await executeGoalDeletion({ userId, goalId: String(resolved.goal._id) });
    const title = result.title || resolved.goal.title;
    const reply = deletedReply(title, result.refundedAmount ?? 0, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return {
      handled: true,
      deleted: true,
      action: result.status === "duplicate" ? "duplicate" : "deleted",
      goalTitle: title,
      refundedAmount: result.refundedAmount ?? 0,
      reply,
    };
  }
  if (resolved.kind === "ambiguous") {
    const reply = ambiguousReply(resolved.matches, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, deleted: false, action: "ambiguous", matches: resolved.matches.map(publicGoal), reply };
  }
  const reply = notFoundReply(hint, language);
  await ChatMessage.create({ user: userId, role: "user", text: message });
  await ChatMessage.create({ user: userId, role: "assistant", text: reply });
  return { handled: true, deleted: false, action: "not_found", reply };
};

// ---------------------------------------------------------------------------
// Add-money via chat. Deterministic and LLM-free: the parser extracts only
// { amount, conditionThreshold, goalHint }; every lookup, check and the money
// movement itself run here server-side through the shared
// executeManualContribution service (same atomic Wallet -x / Goal +x /
// GoalTransfer / Savings expense Transaction + idempotency as Add money).
// Explicit exact goal + amount executes directly; ambiguous matches never
// move money and ask the user to choose.
// ---------------------------------------------------------------------------

const cleanIdempotencyKey = (raw) =>
  typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 100) : undefined;

const executeChatContribution = async ({ userId, goal, amount, idempotencyKey }) => {
  try {
    const result = await executeManualContribution({
      userId,
      goalId: String(goal._id),
      amount,
      idempotencyKey,
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, err };
  }
};

const contributionFailureReply = (err, language) => {
  const msg = String(err?.message || "Could not add money.");
  return addMoneyFailedReply(msg.endsWith(".") ? `${msg} ` : `${msg}. `, language);
};

// Shared helper for the coach endpoint. Returns null when the message is not
// an add-money command. CONFIRM-FIRST: a plain chat message NEVER moves
// money. It returns a read-only proposal (goal, amount, wallet impact,
// short-lived confirmation token). Money moves only via the explicit
// POST /api/ai/goals/add-money-confirm-token with that token.
export const handleCoachGoalAddMoneyMessage = async ({ userId, message, language }) => {
  const intent = parseGoalAddMoneyIntent(message);
  if (!intent) return null;

  const goals = await fetchUserGoalsForChat(userId);
  const resolved = resolveGoalFromHint(goals, intent.goalHint);

  if (resolved.kind === "ambiguous") {
    const reply = addMoneyAmbiguousReply(resolved.matches, intent.amount, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return {
      handled: true,
      added: false,
      action: "ambiguous",
      matches: resolved.matches.map(publicGoal),
      amount: intent.amount,
      conditionThreshold: intent.conditionThreshold,
      reply,
    };
  }
  if (resolved.kind !== "single") {
    const reply = addMoneyNotFoundReply(intent.goalHint, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, added: false, action: "not_found", amount: intent.amount, reply };
  }

  const goal = resolved.goal;
  if (goal.status !== "active") {
    const reply = addMoneyInactiveGoalReply(goal, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, added: false, action: "inactive", goal: publicGoal(goal), reply };
  }
  if (intent.amount == null) {
    const reply = addMoneyNeedAmountReply(goal.title, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, added: false, action: "need_amount", goal: publicGoal(goal), reply };
  }

  // Wallet-balance condition enforced server-side on the live balance.
  // Strictly greater-than: balance equal to or below the threshold blocks.
  if (intent.conditionThreshold != null) {
    const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
    const balance = Number(wallet?.balance) || 0;
    if (!(balance > intent.conditionThreshold)) {
      const reply = addMoneyConditionFailedReply(intent.conditionThreshold, balance, language);
      await ChatMessage.create({ user: userId, role: "user", text: message });
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return { handled: true, added: false, action: "condition_failed", goal: publicGoal(goal), reply };
    }
  }

  // Propose only — the LLM / chat text can never invoke a transfer directly.
  const { proposeGoalContribution } = await import("../services/goalActionProposalService.js");
  try {
    const proposal = await proposeGoalContribution({
      userId,
      goalId: String(goal._id),
      amount: intent.amount,
      conditionThreshold: intent.conditionThreshold,
    });
    const reply =
      language === "bn"
        ? `নিশ্চিত করুন: “${proposal.goal.title}” goal-এ ৳${Number(proposal.amount).toLocaleString("en-BD")} যোগ হবে। Wallet ৳${Number(proposal.walletImpact.before).toLocaleString("en-BD")} → ৳${Number(proposal.walletImpact.after).toLocaleString("en-BD")}। এখনো কোনো টাকা সরেনি — Confirm transfer চাপুন অথবা Cancel করুন।`
        : `Please confirm: add ৳${Number(proposal.amount).toLocaleString("en-BD")} to your “${proposal.goal.title}” goal? Wallet ৳${Number(proposal.walletImpact.before).toLocaleString("en-BD")} → ৳${Number(proposal.walletImpact.after).toLocaleString("en-BD")}. No money has moved yet — press Confirm transfer or Cancel.`;
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return {
      handled: true,
      added: false,
      action: "confirm_required",
      goal: publicGoal(goal),
      amount: proposal.amount,
      conditionThreshold: proposal.conditionThreshold,
      walletImpact: proposal.walletImpact,
      confirmationToken: proposal.confirmationToken,
      expiresAt: proposal.expiresAt,
      reply,
    };
  } catch (err) {
    const statusCode = err?.statusCode;
    const reply = contributionFailureReply(err, language);
    await ChatMessage.create({ user: userId, role: "user", text: message });
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return { handled: true, added: false, action: "failed", statusCode, goal: publicGoal(goal), reply };
  }
};

// POST /api/ai/goals/add-money-confirm — explicit goal choice for an
// ambiguous chat command, or a client-side confirm button.
// Body: { goalId, amount, conditionThreshold?, idempotencyKey?, language? }.
// Every check (ownership, status, wallet condition, funds) runs server-side;
// money moves only through the shared executeManualContribution service.
export const confirmGoalAddMoney = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalId: rawId, amount: rawAmount, conditionThreshold: rawThreshold, idempotencyKey, language: rawLanguage } =
      req.body ?? {};
    const language = cleanLanguage(rawLanguage);

    if (typeof rawId !== "string" || !mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ success: false, message: "A valid goalId is required." });
    }
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "A valid amount greater than 0 is required." });
    }
    let threshold = null;
    if (rawThreshold !== undefined && rawThreshold !== null && rawThreshold !== "") {
      threshold = Number(rawThreshold);
      if (!Number.isFinite(threshold) || threshold < 0) {
        return res.status(400).json({ success: false, message: "Invalid condition threshold." });
      }
    }

    // Ownership + status checked server-side; never trust the client.
    const goal = await fetchUserGoalsForChat(userId).then((goals) => goals.find((g) => String(g._id) === String(rawId)));
    if (!goal) {
      return res.status(404).json({ success: false, message: "Goal not found." });
    }
    if (goal.status !== "active") {
      const reply = addMoneyInactiveGoalReply(goal, language);
      await ChatMessage.create({ user: userId, role: "assistant", text: reply });
      return res.status(400).json({ success: false, message: reply });
    }

    if (threshold != null) {
      const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
      const balance = Number(wallet?.balance) || 0;
      if (!(balance > threshold)) {
        const reply = addMoneyConditionFailedReply(threshold, balance, language);
        await ChatMessage.create({ user: userId, role: "assistant", text: reply });
        return res.status(400).json({ success: false, message: reply, action: "condition_failed" });
      }
    }

    const outcome = await executeChatContribution({ userId, goal, amount, idempotencyKey: cleanIdempotencyKey(idempotencyKey) });
    if (!outcome.ok) {
      if (outcome.err?.statusCode === 400 || outcome.err?.statusCode === 404) {
        return res.status(outcome.err.statusCode).json({ success: false, message: outcome.err.message });
      }
      if (String(outcome.err?.message || "").includes("replica set")) {
        return res.status(503).json({ success: false, message: outcome.err.message });
      }
      throw outcome.err;
    }

    const title = outcome.result.goal?.title || goal.title;
    const doneAmount = outcome.result.status === "duplicate" ? Number(outcome.result.transfer?.amount) || amount : amount;
    const released = Boolean(outcome.result.released);
    const releasedAmount = Number(outcome.result.releasedAmount) || 0;
    const reply = released
      ? addedEarlyReleaseReply(title, doneAmount, releasedAmount, language)
      : addedReply(title, doneAmount, language);
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return res.status(200).json({
      success: true,
      duplicate: outcome.result.status === "duplicate",
      goalTitle: title,
      amount: doneAmount,
      completed: Boolean(outcome.result.completed),
      released,
      releasedAmount,
      reply,
    });
  } catch (error) {
    console.error("AI add-money-confirm failed:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "Could not add money. No money was moved. Please try again.",
    });
  }
};

// POST /api/ai/goals/add-money-propose — read-only proposal for an explicit
// goal choice (e.g. after an ambiguous chat match). Returns goal, amount,
// wallet impact + short-lived confirmation token. Moves NO money.
export const proposeGoalAddMoney = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalId: rawId, amount: rawAmount, conditionThreshold: rawThreshold } = req.body ?? {};
    if (typeof rawId !== "string" || !mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ success: false, message: "A valid goalId is required." });
    }
    const { proposeGoalContribution } = await import("../services/goalActionProposalService.js");
    const proposal = await proposeGoalContribution({
      userId, goalId: rawId, amount: rawAmount, conditionThreshold: rawThreshold,
    });
    return res.status(200).json({ success: true, ...proposal, confirmationRequired: true });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    console.error("AI add-money-propose failed:", error?.message || error);
    return res.status(500).json({ success: false, message: "Could not propose the transfer. No money was moved." });
  }
};

// POST /api/ai/goals/add-money-confirm-token — the ONLY chat path that moves
// money from a proposal. Body: { confirmationToken, idempotencyKey?, language? }.
// Token is user-bound, action-bound, short-lived, one-time-use, server-validated.
export const confirmGoalAddMoneyToken = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { confirmationToken, idempotencyKey, language: rawLanguage } = req.body ?? {};
    const language = cleanLanguage(rawLanguage);
    const { confirmGoalContribution } = await import("../services/goalActionProposalService.js");
    const { result } = await confirmGoalContribution({
      userId, confirmationToken, idempotencyKey: cleanIdempotencyKey(idempotencyKey),
    });
    const title = result.goal?.title || "goal";
    const doneAmount = Number(result.transfer?.amount) || 0;
    const released = Boolean(result.released);
    const releasedAmount = Number(result.releasedAmount) || 0;
    const reply = released
      ? addedEarlyReleaseReply(title, doneAmount, releasedAmount, language)
      : addedReply(title, doneAmount, language);
    await ChatMessage.create({ user: userId, role: "assistant", text: reply });
    return res.status(200).json({
      success: true,
      duplicate: result.status === "duplicate",
      goalTitle: title,
      amount: doneAmount,
      completed: Boolean(result.completed),
      released,
      releasedAmount,
      reply,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    if (String(error?.message || "").includes("replica set")) {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error("AI add-money-confirm-token failed:", error?.message || error);
    return res.status(500).json({ success: false, message: "Could not add money. No money was moved. Please try again." });
  }
};

// POST /api/ai/goals/add-money-cancel-token — discard a proposal. Never moves money.
export const cancelGoalAddMoneyToken = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { confirmationToken } = req.body ?? {};
    const { cancelGoalContribution } = await import("../services/goalActionProposalService.js");
    const out = await cancelGoalContribution({ userId, confirmationToken });
    await ChatMessage.create({ user: userId, role: "assistant", text: `Transfer to “${out.goalTitle}” cancelled. No money was moved.` });
    return res.status(200).json({ success: true, ...out });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: "Could not cancel. No money was moved." });
  }
};
