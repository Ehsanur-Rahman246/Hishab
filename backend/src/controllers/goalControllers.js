import Goal from "../models/Goal.js";
import GoalTransfer from "../models/GoalTransfer.js";
import {
  executeGoalDeletion,
  executeManualContribution,
  isAllowedAutomationPercentage,
  isValidPercentage,
  isValidPriority,
  runDueAutomationForUser,
} from "../services/goalAutomationService.js";

const VALID_FREQUENCIES = ["weekly", "monthly"];
const PERCENTAGE_CHOICES_LABEL = "5, 10, 15, 20, or 25";

// Validate automation payload. Returns { ok, errors, value }.
const validateAutomationInput = (body, { allowPartial = false } = {}) => {
  const errors = [];
  const value = {};
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Invalid automation details."], value: null };
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") errors.push("automation.enabled must be true or false.");
    else value.enabled = body.enabled;
  } else if (!allowPartial) {
    value.enabled = false;
  }
  if (body.frequency !== undefined) {
    if (!VALID_FREQUENCIES.includes(body.frequency)) errors.push("automation.frequency must be 'weekly' or 'monthly'.");
    else value.frequency = body.frequency;
  } else if (!allowPartial && value.enabled) {
    errors.push("automation.frequency is required when automation is enabled.");
  }
  if (body.percentage !== undefined) {
    const n = Number(body.percentage);
    if (!isAllowedAutomationPercentage(n))
      errors.push(`automation.percentage must be one of: ${PERCENTAGE_CHOICES_LABEL}.`);
    else value.percentage = n;
  } else if (!allowPartial && value.enabled) {
    errors.push("automation.percentage is required when automation is enabled.");
  }
  if (body.priority !== undefined) {
    const n = Number(body.priority);
    if (!isValidPriority(n)) errors.push("automation.priority must be a positive integer.");
    else value.priority = n;
  } else if (!allowPartial && value.enabled) {
    errors.push("automation.priority is required when automation is enabled.");
  }
  if (body.paused !== undefined) {
    if (typeof body.paused !== "boolean") errors.push("automation.paused must be true or false.");
    else value.paused = body.paused;
  }
  if (errors.length > 0) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value };
};

const automationView = (goal) => goal.automation || { enabled: false };

export const createGoal = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { title, description, targetAmount, targetDate, automation } = req.body;

    if (!title || !targetAmount || !targetDate) {
      return res.status(400).json({
        success: false,
        message: "Title, target amount, and target date are required",
      });
    }

    if (!Number.isFinite(Number(targetAmount)) || Number(targetAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Target amount must be greater than 0",
      });
    }

    const targetDateValue = new Date(targetDate);

    if (Number.isNaN(targetDateValue.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid target date",
      });
    }

    if (targetDateValue <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Target date must be in the future",
      });
    }

    let automationDoc = { enabled: false, paused: false, lastProcessedCycle: null, enabledAt: null };
    if (automation !== undefined && automation !== null) {
      const checked = validateAutomationInput(automation);
      if (!checked.ok) {
        return res.status(400).json({ success: false, message: checked.errors[0], errors: checked.errors });
      }
      if (checked.value.enabled) {
        automationDoc = {
          enabled: true,
          frequency: checked.value.frequency,
          percentage: checked.value.percentage,
          priority: checked.value.priority,
          paused: false,
          lastProcessedCycle: null,
          enabledAt: new Date(),
        };
      }
    }

    const goal = await Goal.create({
      user: userId,
      title,
      description: description || null,
      targetAmount: Number(targetAmount),
      targetDate: targetDateValue,
      automation: automationDoc,
    });

    return res.status(201).json({
      success: true,
      message: "Goal created successfully",
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getGoals = async (req, res) => {
  try {
    const userId = req.user.userId;

    const goals = await Goal.find({ user: userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      goals,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOneGoal = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const goal = await Goal.findOne({
      _id: id,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    return res.status(200).json({
      success: true,
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateGoal = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const { title, description, targetAmount, targetDate } = req.body;

    // Automation fields are never accepted here — use PATCH /:id/automation.
    if (req.body.savedAmount !== undefined || req.body.automation !== undefined) {
      return res.status(400).json({
        success: false,
        message: "Use the automation endpoint to change savings or automation details.",
      });
    }

    const goal = await Goal.findOne({
      _id: id,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    if (goal.status === "released") {
      return res.status(400).json({
        success: false,
        message: "Released goals cannot be edited.",
      });
    }

    if (targetAmount !== undefined) {
      const amountValue = Number(targetAmount);

      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        return res.status(400).json({
          success: false,
          message: "Target amount must be a number greater than 0",
        });
      }

      if (amountValue < goal.savedAmount) {
        return res.status(400).json({
          success: false,
          message: "Target amount cannot be less than the amount already saved",
        });
      }

      goal.targetAmount = amountValue;
    }

    if (targetDate !== undefined) {
      const targetDateValue = new Date(targetDate);

      if (Number.isNaN(targetDateValue.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid target date",
        });
      }

      if (goal.status === "active" && targetDateValue <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Target date must be in the future",
        });
      }

      goal.targetDate = targetDateValue;
    }

    if (title !== undefined) {
      goal.title = title;
    }

    if (description !== undefined) {
      goal.description = description || null;
    }

    await goal.save();

    return res.status(200).json({
      success: true,
      message: "Goal updated successfully",
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// PATCH /api/goals/:id/automation — enable/disable, frequency, percentage,
// priority, pause/resume. Never accepts savedAmount.
export const updateGoalAutomation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    if (req.body.savedAmount !== undefined) {
      return res.status(400).json({
        success: false,
        message: "savedAmount cannot be set directly.",
      });
    }

    const goal = await Goal.findOne({ _id: id, user: userId });
    if (!goal) {
      return res.status(404).json({ success: false, message: "Goal not found" });
    }
    if (goal.status === "released") {
      return res.status(400).json({ success: false, message: "Released goals cannot enable automation." });
    }
    if (goal.status !== "active" && req.body.enabled === true) {
      return res.status(400).json({
        success: false,
        message: "Only active goals can enable automation.",
      });
    }

    const checked = validateAutomationInput(req.body, { allowPartial: true });
    if (!checked.ok) {
      return res.status(400).json({ success: false, message: checked.errors[0], errors: checked.errors });
    }
    const v = checked.value;
    const auto = goal.automation || {};
    const enabling = v.enabled === true && !auto.enabled;

    if (v.enabled !== undefined) {
      if (v.enabled && goal.status !== "active") {
        return res.status(400).json({ success: false, message: "Only active goals can enable automation." });
      }
      goal.automation.enabled = v.enabled;
      if (v.enabled && !goal.automation.enabledAt) goal.automation.enabledAt = new Date();
      if (enabling) {
        goal.automation.paused = false;
        if (!goal.automation.enabledAt) goal.automation.enabledAt = new Date();
      }
      if (!v.enabled) goal.automation.paused = false;
    }
    if (v.frequency !== undefined) goal.automation.frequency = v.frequency;
    if (v.percentage !== undefined) goal.automation.percentage = v.percentage;
    if (v.priority !== undefined) goal.automation.priority = v.priority;
    if (v.paused !== undefined) {
      if (v.paused && !goal.automation.enabled) {
        return res.status(400).json({ success: false, message: "Enable automation before pausing it." });
      }
      goal.automation.paused = v.paused;
    }

    // Enabling requires complete details. New/changed percentages must be
    // one of the five fixed options; legacy stored values (any 1–100) keep
    // working and are never rewritten here.
    if (goal.automation.enabled) {
      if (!VALID_FREQUENCIES.includes(goal.automation.frequency)) {
        return res.status(400).json({ success: false, message: "automation.frequency must be 'weekly' or 'monthly'." });
      }
      if (v.percentage !== undefined && !isAllowedAutomationPercentage(goal.automation.percentage)) {
        return res.status(400).json({
          success: false,
          message: `automation.percentage must be one of: ${PERCENTAGE_CHOICES_LABEL}.`,
        });
      }
      if (!isValidPercentage(goal.automation.percentage)) {
        return res.status(400).json({ success: false, message: "automation.percentage is invalid. Pick one of: 5, 10, 15, 20, or 25." });
      }
      if (!isValidPriority(goal.automation.priority)) {
        return res.status(400).json({ success: false, message: "automation.priority must be a positive integer." });
      }
    }

    await goal.save();
    return res.status(200).json({ success: true, message: "Automation updated successfully", goal, automation: automationView(goal) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const deleteGoal = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const idempotencyKey =
      (typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey) ||
      (typeof req.headers["x-idempotency-key"] === "string" && req.headers["x-idempotency-key"]) ||
      undefined;

    const result = await executeGoalDeletion({ userId, goalId: id, idempotencyKey });

    // Ledger records are the audit trail and are never deleted.
    if (result.status === "duplicate") {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: result.refundedAmount > 0
          ? `This goal was already deleted; ${result.refundedAmount} was already returned to your wallet. No money was moved again.`
          : "This goal was already deleted; no money was moved again.",
        refundedAmount: result.refundedAmount,
        title: result.title,
        transfer: result.transfer,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        result.refundedAmount > 0
          ? `Goal deleted. ${result.refundedAmount} returned to your wallet.`
          : "Goal deleted successfully",
      refundedAmount: result.refundedAmount,
      title: result.title,
      alreadyReleased: Boolean(result.alreadyReleased),
    });
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ success: false, message: error.message || "Goal not found" });
    }
    if (String(error?.message || "").includes("replica set")) {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error("Goal deletion failed:", error?.message || error);

    return res.status(500).json({
      success: false,
      message: "Could not delete the goal. No money was moved. Please try again.",
    });
  }
};

export const selectPlan = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Plan ID is required",
      });
    }

    const goal = await Goal.findOne({
      _id: id,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    const plan = goal.plans.id(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    goal.selectedPlan = plan._id;
    goal.planEdited = false;

    await goal.save();

    return res.status(200).json({
      success: true,
      message: "Plan selected successfully",
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const { monthlyAmount, weeklyAmount, projectedCompletionDate } = req.body;

    const goal = await Goal.findOne({
      _id: id,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    if (!goal.selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "No plan has been selected",
      });
    }

    const plan = goal.plans.id(goal.selectedPlan);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Selected plan not found",
      });
    }

    if (monthlyAmount !== undefined) {
      if (Number(monthlyAmount) < 0) {
        return res.status(400).json({
          success: false,
          message: "Monthly amount cannot be negative",
        });
      }

      plan.monthlyAmount = Number(monthlyAmount);
    }

    if (weeklyAmount !== undefined) {
      if (Number(weeklyAmount) < 0) {
        return res.status(400).json({
          success: false,
          message: "Weekly amount cannot be negative",
        });
      }

      plan.weeklyAmount = Number(weeklyAmount);
    }

    if (projectedCompletionDate !== undefined) {
      const date = new Date(projectedCompletionDate);

      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid projected completion date",
        });
      }

      plan.projectedCompletionDate = date;
    }

    goal.planEdited = true;

    await goal.save();

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// POST /api/goals/:id/add-savings — manual Wallet -> Goal transfer.
// Atomic (Wallet deduct + Goal credit + GoalTransfer ledger row +
// Savings expense Transaction in one MongoDB transaction) and
// idempotent: resend the same idempotencyKey and the original transfer is
// returned without moving money again.
// A contribution that fully funds the goal releases the full savedAmount
// back to the wallet inside the SAME transaction (early completion release:
// status `released`, one goal_release ledger row, one Savings income
// Transaction, one deduplicated alert) — the response then carries
// completed: true, released: true, releasedAmount, and walletBalance.
export const addSavings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { amount, idempotencyKey } = req.body;

    const result = await executeManualContribution({
      userId,
      goalId: id,
      amount,
      idempotencyKey,
    });

    if (result.status === "duplicate") {
      if (result.reason === "already_released") {
        const releasedAmount = Number(result.transfer?.amount) || 0;
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "This goal was already completed and released; no money was moved again.",
          goal: result.goal,
          transfer: result.transfer,
          completed: true,
          released: true,
          releasedAmount,
        });
      }
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "This transfer was already processed; no money was moved again.",
        goal: result.goal,
        transfer: result.transfer,
        completed: Boolean(result.goal?.status === "released" || result.goal?.status === "completed"),
        released: result.goal?.status === "released",
      });
    }

    if (result.released) {
      const releasedAmount = Number(result.releasedAmount) || 0;
      return res.status(200).json({
        success: true,
        message: `Goal completed early — BDT ${releasedAmount.toLocaleString("en-BD")} has been returned to your wallet.`,
        goal: result.goal,
        transfer: result.transfer,
        completed: true,
        released: true,
        releasedAmount,
        walletBalance: result.walletBalanceAfter,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.completed ? `You reached "${result.goal.title}"!` : "Savings added successfully",
      goal: result.goal,
      transfer: result.transfer,
      completed: Boolean(result.completed),
      released: false,
      releasedAmount: 0,
      walletBalance: result.walletBalanceAfter,
    });
  } catch (error) {
    if (error?.statusCode === 400 || error?.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (String(error?.message || "").includes("replica set")) {
      return res.status(503).json({ success: false, message: error.message });
    }
    // Technical details stay in server logs; clients get a safe message.
    console.error("Manual goal transfer failed:", error?.message || error);
    return res.status(500).json({ success: false, message: "Could not complete the transfer. Please try again." });
  }
};

export const updateGoalStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { status } = req.body;

    // "released" is system-only (target-date job / run-now).
    const allowedStatuses = ["active", "paused", "cancelled", "completed"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid goal status",
      });
    }

    const goal = await Goal.findOne({
      _id: id,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: "Goal not found",
      });
    }

    if (goal.status === "released") {
      return res.status(400).json({
        success: false,
        message: "Released goals cannot change status.",
      });
    }

    if (status === "completed" && goal.savedAmount < goal.targetAmount) {
      return res.status(400).json({
        success: false,
        message: "Goal can only be completed once fully funded",
      });
    }

    goal.status = status;

    if (status === "completed") {
      goal.completedAt = new Date();
    } else {
      goal.completedAt = null;
    }

    await goal.save();

    return res.status(200).json({
      success: true,
      message: "Goal status updated successfully",
      goal,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GET /api/goals/:id/transfers — audit history for one owned goal.
export const getGoalTransfers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const goal = await Goal.findOne({ _id: id, user: userId }).select("_id");
    if (!goal) {
      return res.status(404).json({ success: false, message: "Goal not found" });
    }
    const transfers = await GoalTransfer.find({ user: userId, goal: id }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, transfers });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/goals/automation/run-now — demo/test for the logged-in user only.
// Runs releases + the currently-due cycle with full idempotency/atomicity
// using the same executeContribution/executeRelease logic as the scheduler.
export const runAutomationNow = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Never accept another userId: the JWT user is the only scope.
    if (req.body && (req.body.userId || req.body.user)) {
      return res.status(400).json({
        success: false,
        message: "userId must not be provided; the logged-in user is used.",
      });
    }
    const summary = await runDueAutomationForUser(userId, new Date());
    return res.status(200).json({ success: true, message: "Automation cycle processed.", summary });
  } catch (error) {
    if (String(error?.message || "").includes("replica set")) {
      return res.status(503).json({ success: false, message: error.message });
    }
    if (error?.statusCode === 400 || error?.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    // Technical details stay in server logs; clients get a safe message.
    console.error("Automation run-now failed:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "Could not process the automation cycle. No money was moved by the failed step. Please try again.",
    });
  }
};
