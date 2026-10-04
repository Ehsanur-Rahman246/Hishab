import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    monthlyAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    weeklyAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    projectedCompletionDate: {
      type: Date,
      required: true,
    },
  },
  {
    _id: true,
  },
);

const goalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    targetAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    savedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    targetDate: {
      type: Date,
      required: true,
    },

    plans: {
      type: [planSchema],
      default: [],
    },

    selectedPlan: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    planEdited: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "completed", "paused", "cancelled", "released"],
      default: "active",
    },

    completedAt: {
      type: Date,
      default: null,
    },

    releasedAt: {
      type: Date,
      default: null,
    },

    releasedAmount: {
      type: Number,
      default: null,
      min: 0,
    },

    automation: {
      enabled: { type: Boolean, default: false },
      frequency: {
        type: String,
        enum: ["weekly", "monthly"],
        default: "monthly",
      },
      percentage: {
        type: Number,
        default: null,
        min: 1,
        max: 100,
      },
      priority: {
        type: Number,
        default: null,
        min: 1,
      },
      paused: { type: Boolean, default: false },
      lastProcessedCycle: { type: String, default: null },
      enabledAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  },
);

goalSchema.index({ user: 1, status: 1 });

const Goal = mongoose.model("Goal", goalSchema);

export default Goal;
