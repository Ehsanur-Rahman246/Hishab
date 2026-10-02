import Summary from "../models/Summary.js";
import Transaction from "../models/Transaction.js";

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const getPeriodDates = (period, date = new Date()) => {
  // shift so the UTC getters read Dhaka wall-clock time
  const local = new Date(new Date(date).getTime() + DHAKA_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  let startLocal;
  let endLocal;

  if (period === "weekly") {
    const day = local.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // week starts Monday
    startLocal = Date.UTC(y, m, d + diff);
    endLocal = startLocal + 7 * DAY_MS - 1;
  } else {
    startLocal = Date.UTC(y, m, 1);
    endLocal = Date.UTC(y, m + 1, 1) - 1;
  }

  return {
    startDate: new Date(startLocal - DHAKA_OFFSET_MS),
    endDate: new Date(endLocal - DHAKA_OFFSET_MS),
  };
};

const getCategoryKey = (category) => {
  const categoryMap = {
    Food: "food",
    Transport: "transport",
    Shopping: "shopping",
    Bills: "bills",
    Entertainment: "entertainment",
    Healthcare: "healthcare",
    Education: "education",
    Savings: "savings",
    "Cash Out": "cashOut",
    "Send Money": "sendMoney",
    "Mobile Recharge": "mobileRecharge",
    Other: "other",
  };

  return categoryMap[category] || "other";
};

export const getSummaries = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { period } = req.query;

    const filter = {
      user: userId,
    };

    if (period) {
      if (!["weekly", "monthly"].includes(period)) {
        return res.status(400).json({
          success: false,
          message: "Invalid period",
        });
      }

      filter.period = period;
    }

    const summaries = await Summary.find(filter).sort({
      startDate: -1,
    });

    return res.status(200).json({
      success: true,
      summaries,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOneSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const summary = await Summary.findOne({
      _id: id,
      user: userId,
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const generateSummary = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { period, date } = req.body;

    if (!period || !["weekly", "monthly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Valid period is required",
      });
    }

    const baseDate = date ? new Date(date) : new Date();

    if (Number.isNaN(baseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const { startDate, endDate } = getPeriodDates(period, baseDate);

    const transactions = await Transaction.find({
      user: userId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const expenses = {
      food: 0,
      transport: 0,
      shopping: 0,
      bills: 0,
      entertainment: 0,
      healthcare: 0,
      education: 0,
      savings: 0,
      cashOut: 0,
      sendMoney: 0,
      mobileRecharge: 0,
      other: 0,
    };

    let income = 0;
    let totalExpense = 0;

    for (const transaction of transactions) {
      if (transaction.type === "income") {
        income += transaction.amount;
        continue;
      }

      if (transaction.type === "expense") {
        totalExpense += transaction.amount;

        const categoryKey = getCategoryKey(transaction.category);

        expenses[categoryKey] += transaction.amount;
      }
    }

    // money moved into "Savings" counts as saved, not spent
    const spending = totalExpense - expenses.savings;
    const savings = income - spending; // can be negative = deficit

    const summary = await Summary.findOneAndUpdate(
      {
        user: userId,
        period,
        startDate,
      },
      {
        user: userId,
        period,
        startDate,
        endDate,
        income,
        expenses,
        totalExpense,
        savings,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Summary generated successfully",
      summary,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const summary = await Summary.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Summary deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
