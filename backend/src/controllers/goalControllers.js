import Goal from "../models/Goal.js";

export const createGoal = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { title, description, targetAmount, targetDate } = req.body;

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

    const goal = await Goal.create({
      user: userId,
      title,
      description: description || null,
      targetAmount: Number(targetAmount),
      targetDate: targetDateValue,
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

      if (targetDateValue <= new Date()) {
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

export const deleteGoal = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const goal = await Goal.findOneAndDelete({
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
      message: "Goal deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
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

export const addSavings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { amount } = req.body;

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
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

    if (goal.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Savings can only be added to an active goal",
      });
    }

    const newSavedAmount = goal.savedAmount + value;

    if (newSavedAmount > goal.targetAmount) {
      return res.status(400).json({
        success: false,
        message: "Savings cannot exceed the target amount",
      });
    }

    goal.savedAmount = newSavedAmount;

    if (goal.savedAmount === goal.targetAmount) {
      goal.status = "completed";
      goal.completedAt = new Date();
    }

    await goal.save();

    return res.status(200).json({
      success: true,
      message: "Savings added successfully",
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

export const updateGoalStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { status } = req.body;

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
