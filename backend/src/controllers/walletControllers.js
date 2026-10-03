import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";

export const getWallet = async (req, res) => {
  try {
    const userId = req.user.userId;

    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    return res.status(200).json({
      success: true,
      wallet,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const addMoney = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, description } = req.body;

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a number greater than 0",
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: value } },
      { new: true },
    );

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    await Transaction.create({
      user: userId,
      type: "income",
      category: "Other",
      amount: value,
      date: new Date(),
      description: description || "Money added to wallet",
    });

    return res.status(200).json({
      success: true,
      message: "Money added successfully",
      balance: wallet.balance,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const withdrawMoney = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, description } = req.body;

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a number greater than 0",
      });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: value } },
      { $inc: { balance: -value } },
      { new: true },
    );

    if (!wallet) {
      const exists = await Wallet.exists({ user: userId });
      return res.status(exists ? 400 : 404).json({
        success: false,
        message: exists ? "Insufficient wallet balance" : "Wallet not found",
      });
    }

    await Transaction.create({
      user: userId,
      type: "expense",
      category: "Cash Out",
      amount: value,
      date: new Date(),
      description: description || "Money withdrawn from wallet",
    });

    return res.status(200).json({
      success: true,
      message: "Money withdrawn successfully",
      balance: wallet.balance,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
