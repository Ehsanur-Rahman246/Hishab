import mongoose from "mongoose";

const categorySchema = {
  food: {
    type: Number,
    default: 0,
  },

  transport: {
    type: Number,
    default: 0,
  },

  shopping: {
    type: Number,
    default: 0,
  },

  bills: {
    type: Number,
    default: 0,
  },

  entertainment: {
    type: Number,
    default: 0,
  },

  healthcare: {
    type: Number,
    default: 0,
  },

  education: {
    type: Number,
    default: 0,
  },

  savings: {
    type: Number,
    default: 0,
  },

  cashOut: {
    type: Number,
    default: 0,
  },

  sendMoney: {
    type: Number,
    default: 0,
  },

  mobileRecharge: {
    type: Number,
    default: 0,
  },

  other: {
    type: Number,
    default: 0,
  },
};

const summarySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    period: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    income: {
      type: Number,
      default: 0,
      min: 0,
    },

    expenses: {
      ...categorySchema,
    },

    totalExpense: {
      type: Number,
      default: 0,
      min: 0,
    },

    savings: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

summarySchema.index({ user: 1, period: 1, startDate: 1 }, { unique: true });

const Summary = mongoose.model("Summary", summarySchema);

export default Summary;
