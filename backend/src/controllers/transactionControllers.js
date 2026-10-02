import Transaction from "../models/Transaction.js";

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Healthcare",
  "Education",
  "Savings",
  "Cash Out",
  "Send Money",
  "Mobile Recharge",
  "Other",
];

export const createTransaction = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { type, category, subcategory, amount, date, description } = req.body;

    if (!type || !category || !amount) {
      return res.status(400).json({
        success: false,
        message: "Type, category, and amount are required",
      });
    }

    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction type",
      });
    }

    const amountValue = Number(amount);

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a number greater than 0",
      });
    }

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    const dateValue = date ? new Date(date) : new Date();

    if (Number.isNaN(dateValue.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    const transaction = await Transaction.create({
      user: userId,
      type,
      category,
      subcategory: subcategory || null,
      amount: amountValue,
      date: dateValue,
      description: description || null,
    });

    return res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      transaction,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, category, from, to } = req.query;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

    const filter = { user: userId };

    if (type) {
      if (!["income", "expense"].includes(type)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid type" });
      }
      filter.type = type;
    }

    if (category) {
      if (!CATEGORIES.includes(category)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });
      }
      filter.category = category;
    }

    if (from || to) {
      filter.date = {};

      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid from date" });
        }
        filter.date.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid to date" });
        }
        filter.date.$lte = toDate;
      }
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getSingleTransaction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const transaction = await Transaction.findOne({
      _id: id,
      user: userId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const transaction = await Transaction.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
