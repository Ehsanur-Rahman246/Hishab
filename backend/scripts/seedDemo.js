// backend/scripts/seedDemo.js
// Usage (from /backend):
//   node scripts/seedDemo.js                      -> seed all 7 demo users
//   node scripts/seedDemo.js --dry-run            -> preview only, no database access
//   node scripts/seedDemo.js --only=student       -> just one profile (works with --dry-run too)
// Re-running is safe: it wipes and rebuilds only the demo users' own data.

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../src/models/User.js";
import Wallet from "../src/models/Wallet.js";
import Transaction from "../src/models/Transaction.js";
import Goal from "../src/models/Goal.js";
import Alert from "../src/models/Alert.js";
import Summary from "../src/models/Summary.js";
import ForecastSnapshot from "../src/models/ForecastSnapshot.js";
import ChatMessage from "../src/models/ChatMessage.js";

// ---------- cli + constants ----------
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PIN = "123456";

if (!DRY_RUN && process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

// Month index (UTC, 0 = Jan) -> multiplier for Food/Entertainment.
// Only used by profiles with `seasonal: true` (the two 12-month users).
const SEASON = { 1: 1.1, 2: 1.35, 4: 1.3, 11: 1.1 }; // pre-Eid, Eid-ul-Fitr, Eid-ul-Adha, winter
const SUMMER_MONTHS = [3, 4, 5, 6, 7, 8]; // higher electricity bills

// ---------- small helpers ----------
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const roundTo = (n, step = 5) => Math.round(n / step) * step;
const monthsFromNow = (m) => {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d;
};
const todayUTC = () => {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

// ---------- the generator (one function for every profile) ----------
const generate = (cfg, userId) => {
  const rnd = mulberry32(cfg.seed);
  const between = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const now = new Date();
  const today = todayUTC();
  const start = today - (cfg.days - 1) * DAY_MS;
  const { daily: d, income, monthly: m = {} } = cfg;

  const foodDesc = [
    "Lunch",
    "Dinner",
    "Groceries",
    "Street food",
    "Tea & snacks",
  ];
  const transportDesc = ["Rickshaw", "Bus fare", "CNG", "Uber ride"];
  const entDesc = [
    "Movie",
    "Cafe with friends",
    "Game top-up",
    "Streaming subscription",
  ];

  const txs = [];
  const add = (type, category, amount, dayMs, description) => {
    const date = new Date(dayMs + 6 * HOUR_MS); // 12:00 Dhaka time
    if (date > now) return; // never create future transactions
    txs.push({
      user: userId,
      type,
      category,
      amount: Math.round(amount),
      date,
      description,
    });
  };

  for (let i = 0; i < cfg.days; i++) {
    const dayMs = start + i * DAY_MS;
    const dt = new Date(dayMs);
    const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
    const dom = dt.getUTCDate();
    const month = dt.getUTCMonth();
    const weekIdx = Math.floor(i / 7);

    const scale = Math.max(0.3, 1 + (cfg.trend || 0) * (i / 30.4)); // monthly spending drift
    const season = cfg.seasonal ? SEASON[month] || 1 : 1;
    const summer = cfg.seasonal && SUMMER_MONTHS.includes(month) ? 1.35 : 1;

    // ----- income -----
    if (income.weekly && dow === income.weekly.dow) {
      add(
        "income",
        "Other",
        roundTo(between(income.weekly.min, income.weekly.max), 50),
        dayMs,
        "Weekly pay",
      );
    }
    if (income.lumpy && rnd() < income.lumpy.p) {
      add(
        "income",
        "Other",
        roundTo(between(income.lumpy.min, income.lumpy.max), 100),
        dayMs,
        "Freelance payment",
      );
    }
    if (income.monthly && dom === income.monthly.dom) {
      add("income", "Other", income.monthly.amount, dayMs, income.monthly.desc);
    }

    // ----- daily spending -----
    if (rnd() < d.food.p) {
      add(
        "expense",
        "Food",
        roundTo(between(d.food.min, d.food.max) * scale * season),
        dayMs,
        pick(foodDesc),
      );
    }
    if (dow < 5 && rnd() < d.transport.p) {
      add(
        "expense",
        "Transport",
        roundTo(between(d.transport.min, d.transport.max) * scale),
        dayMs,
        pick(transportDesc),
      );
    }
    if (dow === 5 && rnd() < d.ent.p) {
      add(
        "expense",
        "Entertainment",
        roundTo(between(d.ent.min, d.ent.max) * scale * season),
        dayMs,
        pick(entDesc),
      );
    }
    if (d.recharge && dow === 2 && weekIdx % 2 === 0) {
      add(
        "expense",
        "Mobile Recharge",
        pick(d.recharge),
        dayMs,
        "Mobile data pack",
      );
    }
    if (d.cashOut && dow === 3 && weekIdx % 2 === 1) {
      add(
        "expense",
        "Cash Out",
        roundTo(between(d.cashOut.min, d.cashOut.max), 100),
        dayMs,
        "ATM / agent cash out",
      );
    }

    // ----- monthly items (by day of month) -----
    if (dom === 1) {
      if (m.savings)
        add("expense", "Savings", m.savings, dayMs, "Monthly savings transfer");
      if (m.sendMoney)
        add("expense", "Send Money", m.sendMoney, dayMs, "Sent to family");
    }
    if (dom === 5 && m.electricity) {
      add(
        "expense",
        "Bills",
        roundTo(between(m.electricity[0], m.electricity[1]) * summer, 10),
        dayMs,
        "Electricity bill",
      );
    }
    if (dom === 10 && m.internet)
      add("expense", "Bills", m.internet, dayMs, "Internet bill");
    if (dom === 18 && m.education) {
      add(
        "expense",
        "Education",
        roundTo(between(m.education[0], m.education[1]), 50),
        dayMs,
        "Course / books",
      );
    }
  }

  // one-off big expenses and bonus income (skipped if older than the profile's history)
  for (const o of cfg.oneOffs || []) {
    if (o.daysAgo < cfg.days)
      add("expense", o.category, o.amount, today - o.daysAgo * DAY_MS, o.desc);
  }
  for (const e of cfg.extraIncome || []) {
    if (e.daysAgo < cfg.days)
      add("income", "Other", e.amount, today - e.daysAgo * DAY_MS, e.desc);
  }

  return txs.sort((a, b) => a.date - b.date);
};

// ---------- goals + alerts builders ----------
const buildGoals = (cfg, userId) =>
  (cfg.goals || []).map((g) => {
    const planId = new mongoose.Types.ObjectId();
    return {
      user: userId,
      title: g.title,
      description: g.description,
      targetAmount: g.target,
      savedAmount: g.saved,
      targetDate: monthsFromNow(g.months),
      plans: [
        {
          _id: planId,
          monthlyAmount: g.monthly,
          weeklyAmount: Math.round(g.monthly / 4.33),
          projectedCompletionDate: monthsFromNow(g.months),
        },
      ],
      selectedPlan: planId,
      status: "active",
    };
  });

const buildAlerts = (cfg, userId, goals) =>
  (cfg.alerts || []).map((a) => ({
    user: userId,
    type: a.type,
    severity: a.severity,
    title: a.title,
    message: a.message,
    relatedGoal:
      a.goal !== undefined && goals[a.goal] ? goals[a.goal]._id : null,
  }));

// ---------- the 7 profiles ----------
const PROFILES = [
  // 1) 12 months, spending keeps rising -> HIGH risk
  {
    key: "stretched",
    label: "Stretched (12 months)",
    user: { name: "Demo User", phone: "01700000001", pin: PIN },
    balance: 14750,
    seed: 2026,
    days: 365,
    trend: 0.04,
    seasonal: true,
    income: { weekly: { dow: 4, min: 5800, max: 6600 } }, // paid Friday
    daily: {
      food: { min: 150, max: 400, p: 0.85 },
      transport: { min: 40, max: 150, p: 0.75 },
      ent: { min: 300, max: 800, p: 0.8 },
      recharge: [199, 299, 399],
      cashOut: { min: 1000, max: 2000 },
    },
    monthly: {
      savings: 1500,
      sendMoney: 3000,
      electricity: [1500, 2100],
      internet: 1000,
      education: [600, 1200],
    },
    oneOffs: [
      {
        daysAgo: 290,
        category: "Shopping",
        amount: 18500,
        desc: "New smartphone",
      },
      {
        daysAgo: 200,
        category: "Shopping",
        amount: 12000,
        desc: "Eid shopping",
      },
      {
        daysAgo: 130,
        category: "Healthcare",
        amount: 6500,
        desc: "Dental treatment",
      },
      {
        daysAgo: 70,
        category: "Shopping",
        amount: 7500,
        desc: "Laptop repair",
      },
      {
        daysAgo: 2,
        category: "Healthcare",
        amount: 9000,
        desc: "Hospital bill",
      },
    ],
    extraIncome: [
      { daysAgo: 250, amount: 5000, desc: "Freelance project" },
      { daysAgo: 100, amount: 5000, desc: "Freelance project" },
    ],
    goals: [
      {
        title: "New Laptop",
        description: "Save for a laptop for university and freelance work.",
        target: 60000,
        saved: 15000,
        months: 6,
        monthly: 7500,
      },
      {
        title: "Emergency Fund",
        description: "Three weeks of expenses set aside.",
        target: 30000,
        saved: 8000,
        months: 4,
        monthly: 5500,
      },
    ],
    alerts: [
      {
        type: "unusual_spending",
        severity: "medium",
        title: "Unusual expense detected",
        message:
          "A 9,000 BDT healthcare expense is much higher than your usual spending.",
      },
      {
        type: "cash_flow",
        severity: "high",
        title: "Spending is trending up",
        message:
          "Your weekly expenses have been rising for months. Review your Food and Entertainment spending.",
      },
      {
        type: "savings_goal",
        severity: "low",
        title: "Goal on track",
        message: "You have saved 25% of your New Laptop goal. Keep going!",
        goal: 0,
      },
    ],
  },

  // 2) 12 months, comfortable -> LOW risk
  {
    key: "healthy",
    label: "Healthy (12 months)",
    user: { name: "Nusrat Jahan", phone: "01800000000", pin: PIN },
    balance: 48500,
    seed: 777,
    days: 365,
    trend: 0,
    seasonal: true,
    income: { weekly: { dow: 0, min: 9500, max: 10500 } }, // paid Monday
    daily: {
      food: { min: 120, max: 300, p: 0.8 },
      transport: { min: 40, max: 120, p: 0.7 },
      ent: { min: 200, max: 500, p: 0.6 },
      recharge: [199, 299],
      cashOut: null,
    },
    monthly: {
      savings: 3000,
      sendMoney: 2000,
      electricity: [1200, 1600],
      internet: 1000,
      education: [800, 800],
    },
    oneOffs: [
      {
        daysAgo: 210,
        category: "Entertainment",
        amount: 12000,
        desc: "Weekend trip",
      },
      {
        daysAgo: 150,
        category: "Shopping",
        amount: 8000,
        desc: "Headphones & bag",
      },
    ],
    extraIncome: [
      { daysAgo: 200, amount: 10000, desc: "Eid bonus" },
      { daysAgo: 129, amount: 10000, desc: "Eid-ul-Adha bonus" },
      { daysAgo: 60, amount: 6000, desc: "Freelance project" },
    ],
    goals: [
      {
        title: "New Bike",
        description: "Save for a commuter bike.",
        target: 85000,
        saved: 20000,
        months: 8,
        monthly: 8000,
      },
      {
        title: "Emergency Fund",
        description: "Six months of basic expenses.",
        target: 50000,
        saved: 32000,
        months: 4,
        monthly: 5000,
      },
    ],
    alerts: [
      {
        type: "savings_goal",
        severity: "low",
        title: "Emergency Fund is 64% done",
        message:
          "You are on track to finish your Emergency Fund in about 4 months.",
        goal: 1,
      },
      {
        type: "other",
        severity: "low",
        title: "Spending is under control",
        message:
          "Your weekly expenses are well below your weekly income. Nice work!",
      },
    ],
  },

  // 3) 6 months, spending close to income -> MEDIUM risk
  {
    key: "midearner",
    label: "Mid earner (6 months)",
    user: { name: "Rafiq Hasan", phone: "01900000000", pin: PIN },
    balance: 9800,
    seed: 31,
    days: 183,
    trend: 0.01,
    seasonal: false,
    income: { weekly: { dow: 0, min: 6200, max: 6600 } },
    daily: {
      food: { min: 200, max: 450, p: 0.85 },
      transport: { min: 80, max: 200, p: 0.75 },
      ent: { min: 400, max: 900, p: 0.7 },
      recharge: [199, 299],
      cashOut: { min: 1200, max: 2000 },
    },
    monthly: {
      savings: 1000,
      sendMoney: 2500,
      electricity: [1800, 2400],
      internet: 1000,
    },
    oneOffs: [
      {
        daysAgo: 80,
        category: "Healthcare",
        amount: 4500,
        desc: "Clinic visit & tests",
      },
      { daysAgo: 30, category: "Shopping", amount: 6000, desc: "Clothes" },
    ],
    goals: [
      {
        title: "Family Trip",
        description: "Trip with family next year.",
        target: 25000,
        saved: 4000,
        months: 8,
        monthly: 2600,
      },
    ],
    alerts: [
      {
        type: "cash_flow",
        severity: "medium",
        title: "Spending is close to income",
        message:
          "Your weekly expenses are close to your weekly income. Small cuts in Entertainment and Cash Out would help.",
      },
    ],
  },

  // 4) 6 months, spending falls over time -> improving
  {
    key: "saver",
    label: "Improving saver (6 months)",
    user: { name: "Tanvir Ahmed", phone: "01600000000", pin: PIN },
    balance: 36500,
    seed: 99,
    days: 183,
    trend: -0.05,
    seasonal: false,
    income: { weekly: { dow: 0, min: 7500, max: 8000 } },
    daily: {
      food: { min: 250, max: 550, p: 0.9 },
      transport: { min: 100, max: 250, p: 0.8 },
      ent: { min: 600, max: 1400, p: 0.8 },
      recharge: [299, 399],
      cashOut: { min: 1500, max: 2500 },
    },
    monthly: {
      savings: 2000,
      sendMoney: 3000,
      electricity: [2000, 2600],
      internet: 1200,
      education: [1000, 1000],
    },
    oneOffs: [
      {
        daysAgo: 150,
        category: "Shopping",
        amount: 5500,
        desc: "Festival shopping",
      },
    ],
    goals: [
      {
        title: "Emergency Fund",
        description: "Three months of basic expenses.",
        target: 30000,
        saved: 28000,
        months: 1,
        monthly: 2000,
      },
      {
        title: "Vacation",
        description: "Trip to Cox's Bazar.",
        target: 45000,
        saved: 38000,
        months: 2,
        monthly: 3500,
      },
    ],
    alerts: [
      {
        type: "savings_goal",
        severity: "low",
        title: "Emergency Fund almost complete",
        message:
          "You have saved 93% of your Emergency Fund. One more deposit to go!",
        goal: 0,
      },
      {
        type: "other",
        severity: "low",
        title: "Spending is going down",
        message:
          "Your weekly expenses have dropped steadily over the last months. Great progress!",
      },
    ],
  },

  // 5) 3 months, irregular freelance income
  {
    key: "student",
    label: "Student (3 months)",
    user: { name: "Mim Akter", phone: "01500000000", pin: PIN },
    balance: 3400,
    seed: 5,
    days: 92,
    trend: 0,
    seasonal: false,
    income: {
      lumpy: { p: 0.06, min: 2000, max: 6500 },
      monthly: { dom: 1, amount: 3000, desc: "Family support" },
    },
    daily: {
      food: { min: 80, max: 220, p: 0.85 },
      transport: { min: 20, max: 80, p: 0.7 },
      ent: { min: 150, max: 400, p: 0.5 },
      recharge: [99, 149, 199],
      cashOut: null,
    },
    monthly: { internet: 600, education: [500, 1500] },
    oneOffs: [
      {
        daysAgo: 40,
        category: "Education",
        amount: 6500,
        desc: "Semester fee instalment",
      },
      { daysAgo: 20, category: "Shopping", amount: 7500, desc: "Phone repair" },
    ],
    goals: [
      {
        title: "Exam Fee Fund",
        description: "Cover next semester's exam fees.",
        target: 8000,
        saved: 2500,
        months: 2,
        monthly: 2750,
      },
    ],
    alerts: [
      {
        type: "unusual_spending",
        severity: "medium",
        title: "Large expense: phone repair",
        message:
          "A 7,500 BDT shopping expense is far above your usual spending.",
      },
      {
        type: "cash_flow",
        severity: "low",
        title: "Income is irregular",
        message:
          "Your income arrives in lumps. Keep a small buffer for weeks without freelance pay.",
      },
    ],
  },

  // 6) 1 month, light activity (just enough weeks for regression)
  {
    key: "newuser",
    label: "New user (1 month)",
    user: { name: "Sabbir Hossain", phone: "01400000000", pin: PIN },
    balance: 2800,
    seed: 8,
    days: 30,
    trend: 0,
    seasonal: false,
    income: { weekly: { dow: 0, min: 4000, max: 4500 } },
    daily: {
      food: { min: 100, max: 250, p: 0.7 },
      transport: { min: 30, max: 90, p: 0.6 },
      ent: { min: 150, max: 350, p: 0.4 },
      recharge: [149, 199],
      cashOut: null,
    },
    monthly: { savings: 500, internet: 800 },
    goals: [
      {
        title: "First Savings Goal",
        description: "Start building a savings habit.",
        target: 10000,
        saved: 1500,
        months: 4,
        monthly: 2125,
      },
    ],
    alerts: [
      {
        type: "other",
        severity: "low",
        title: "Welcome to Hishab",
        message:
          "Keep logging your income and spending. Forecasts get sharper every week.",
      },
    ],
  },

  // 7) 1 day -> cold start (fallback model, "not enough data")
  {
    key: "dayone",
    label: "Day-one user (1 day)",
    user: { name: "Ayesha Siddika", phone: "01300000000", pin: PIN },
    balance: 2260,
    days: 1,
    custom: (userId, now) => [
      {
        user: userId,
        type: "income",
        category: "Other",
        amount: 2500,
        date: new Date(now - 5 * HOUR_MS),
        description: "First wallet top-up",
      },
      {
        user: userId,
        type: "expense",
        category: "Food",
        amount: 180,
        date: new Date(now - 3 * HOUR_MS),
        description: "Lunch",
      },
      {
        user: userId,
        type: "expense",
        category: "Transport",
        amount: 60,
        date: new Date(now - 2 * HOUR_MS),
        description: "Rickshaw",
      },
    ],
    goals: [],
    alerts: [
      {
        type: "other",
        severity: "low",
        title: "Add more transactions",
        message:
          "Forecasts need a few weeks of activity to be reliable. Keep logging your spending.",
      },
    ],
  },
];

const buildTxs = (cfg, userId) =>
  cfg.custom ? cfg.custom(userId, Date.now()) : generate(cfg, userId);

// ---------- dry run (no database access) ----------
// Mirrors ml_service.py closely enough to preview the risk the AI service will report.
const mondayKey = (date) => {
  const d = new Date(date);
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd),
  )
    .toISOString()
    .slice(0, 10);
};

const forecastSeries = (vals, horizon = 4) => {
  const n = vals.length;
  if (n >= 4) {
    const xm = (n - 1) / 2;
    const ym = vals.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    vals.forEach((v, x) => {
      sxy += (x - xm) * (v - ym);
      sxx += (x - xm) ** 2;
    });
    const slope = sxy / sxx;
    const intercept = ym - slope * xm;
    return Array.from({ length: horizon }, (_, k) =>
      Math.max(0, intercept + slope * (n + k)),
    );
  }
  const avg = n ? vals.reduce((s, v) => s + v, 0) / n : 0;
  return Array(horizon).fill(avg);
};

const riskOf = (income, expense) => {
  if (income <= 0 && expense <= 0) return "low";
  if (income <= 0) return "high";
  const ratio = expense / income;
  return ratio <= 0.7 ? "low" : ratio <= 1 ? "medium" : "high";
};

const dryRun = (p) => {
  const txs = buildTxs(p, new mongoose.Types.ObjectId());
  const goals = buildGoals(p, new mongoose.Types.ObjectId());
  const sum = (list) => list.reduce((s, t) => s + t.amount, 0);
  const income = txs.filter((t) => t.type === "income");
  const expense = txs.filter((t) => t.type === "expense");

  const byCategory = {};
  for (const t of expense)
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;

  const weekly = {};
  for (const t of txs) {
    const k = mondayKey(t.date);
    weekly[k] ??= { income: 0, expense: 0 };
    weekly[k][t.type] += t.amount;
  }
  const weeks = Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b));
  const levels = { low: 0, medium: 0, high: 0 };
  weeks.forEach(([, v]) => levels[riskOf(v.income, v.expense)]++);

  const predIncome = forecastSeries(weeks.map(([, v]) => v.income));
  const predExpense = forecastSeries(weeks.map(([, v]) => v.expense));
  const nextWeeks = predIncome.map((inc, i) => riskOf(inc, predExpense[i]));
  const overall = riskOf(
    predIncome.reduce((s, v) => s + v, 0),
    predExpense.reduce((s, v) => s + v, 0),
  );

  const dates = txs.map((t) => t.date.getTime());
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  console.log(`\n==================== ${p.label} ====================`);
  console.log(`Login:         phone ${p.user.phone} | PIN ${p.user.pin}`);
  console.log(
    `Date range:    ${iso(Math.min(...dates))} -> ${iso(Math.max(...dates))}`,
  );
  console.log(
    `Transactions:  ${txs.length} (${income.length} income, ${expense.length} expense)`,
  );
  console.log(
    `Income total:  ${sum(income)} BDT | Expense total: ${sum(expense)} BDT | Net: ${sum(income) - sum(expense)} BDT`,
  );
  console.log(
    `Wallet:        ${p.balance} BDT | Goals: ${goals.map((g) => g.title).join(", ") || "none"}`,
  );
  console.log(
    `Week buckets:  ${weeks.length} (${weeks.length >= 4 ? "linear_regression" : "historical_average_fallback"})`,
  );
  console.log(
    `History weeks by risk: low ${levels.low} | medium ${levels.medium} | high ${levels.high}`,
  );
  console.log(
    `Predicted next 4 weeks: ${nextWeeks.join(", ")} -> overall ${overall.toUpperCase()}`,
  );

  console.log("\nExpenses by category:");
  console.table(byCategory);

  console.log("Last 6 weeks (ratio <=0.7 low, <=1.0 medium, >1 high):");
  console.table(
    weeks.slice(-6).map(([week, v]) => ({
      week,
      income: v.income,
      expense: v.expense,
      ratio: v.income ? +(v.expense / v.income).toFixed(2) : "n/a",
    })),
  );

  console.log("Top 5 expenses:");
  console.table(
    [...expense]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((t) => ({
        date: iso(t.date),
        category: t.category,
        amount: t.amount,
        description: t.description,
      })),
  );
};

// ---------- real seeding ----------
const seedProfile = async (p) => {
  const existing = await User.findOne({ phone: p.user.phone });
  if (existing) {
    const filter = { user: existing._id };
    await Promise.all([
      Wallet.deleteMany(filter),
      Transaction.deleteMany(filter),
      Goal.deleteMany(filter),
      Alert.deleteMany(filter),
      Summary.deleteMany(filter),
      ForecastSnapshot.deleteMany(filter),
      ChatMessage.deleteMany(filter),
    ]);
    await User.findByIdAndDelete(existing._id);
  }

  const user = await User.create({
    name: p.user.name,
    phone: p.user.phone,
    pin: await bcrypt.hash(p.user.pin, 10),
  });

  await Wallet.create({
    user: user._id,
    walletNumber: user.phone,
    balance: p.balance,
  });

  const txs = buildTxs(p, user._id);
  await Transaction.insertMany(txs);
  const goals = await Goal.insertMany(buildGoals(p, user._id));
  await Alert.insertMany(buildAlerts(p, user._id, goals));

  const total = (type) =>
    txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  console.log(
    `[${p.label}] ${txs.length} transactions (income ${total("income")}, expense ${total("expense")}), ${goals.length} goals, wallet ${p.balance} BDT`,
  );
};

// ---------- main ----------
const run = async () => {
  const selected = ONLY ? PROFILES.filter((p) => p.key === ONLY) : PROFILES;
  if (selected.length === 0) {
    console.error(
      `Unknown profile "${ONLY}". Keys: ${PROFILES.map((p) => p.key).join(", ")}`,
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("DRY RUN: nothing is written to the database.");
    selected.forEach(dryRun);
    return;
  }

  await mongoose.connect(process.env.DB_URL);
  console.log("Connected to MongoDB\n");

  for (const p of selected) await seedProfile(p);

  console.log("\nLogins (all use PIN " + PIN + "):");
  console.table(
    selected.map((p) => ({
      user: p.user.name,
      phone: p.user.phone,
      profile: p.label,
    })),
  );
  console.log("Next: log in as each user and click generate insights.");

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Seeding failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
