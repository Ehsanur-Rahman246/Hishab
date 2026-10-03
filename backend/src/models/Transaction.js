import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },

    category: {
      type: String,
      enum: [
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
      ],
      required: true,
    },

    subcategory: {
      type: String,
      trim: true,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({ user: 1, date: -1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
