import Alert from "../models/Alert.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import ForecastSnapshot from "../models/ForecastSnapshot.js";
import Goal from "../models/Goal.js";

const DAY = 24 * 60 * 60 * 1000;
const DHAKA = 6 * 60 * 60 * 1000;
const LOW_BALANCE = 500;
const taka = (n) => `৳${Math.round(n).toLocaleString("en-BD")}`;

// Monday 00:00 Dhaka time
const mondayOf = (date) => {
  const l = new Date(date.getTime() + DHAKA);
  const dow = l.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(
    Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + diff) -
      DHAKA,
  );
};

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const buildCandidates = async (userId) => {
  const now = new Date();
  const week = mondayOf(now);
  const wk = week.toISOString().slice(0, 10);
  const out = [];

  const [wallet, expenses, snapshot, goals] = await Promise.all([
    Wallet.findOne({ user: userId }).select("balance").lean(),
    Transaction.find({
      user: userId,
      type: "expense",
      category: { $ne: "Savings" },
      date: { $gte: new Date(week.getTime() - 90 * DAY) },
    })
      .select("amount date category description")
      .lean(),
    ForecastSnapshot.findOne({ user: userId }).sort({ generatedAt: -1 }).lean(),
    Goal.find({ user: userId, status: "active" }).lean(),
  ]);

  // 1. Low balance
  if (wallet && wallet.balance < LOW_BALANCE) {
    out.push({
      key: `low_balance:${wk}`,
      type: "low_balance",
      severity: wallet.balance < 100 ? "high" : "medium",
      title: "Low wallet balance",
      message: `Your balance is ${taka(wallet.balance)}. Consider adding money before your next expense.`,
      weekStart: week,
    });
  }

  // 2. High spending: this week vs average of previous 4 active weeks
  const sumRange = (from, to) =>
    expenses
      .filter((t) => t.date >= from && t.date < to)
      .reduce((s, t) => s + t.amount, 0);
  const thisWeek = sumRange(week, new Date(week.getTime() + 7 * DAY));
  const prior = [1, 2, 3, 4]
    .map((i) =>
      sumRange(
        new Date(week.getTime() - i * 7 * DAY),
        new Date(week.getTime() - (i - 1) * 7 * DAY),
      ),
    )
    .filter((v) => v > 0);
  if (prior.length >= 2) {
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (thisWeek > avg * 1.5) {
      out.push({
        key: `high_spending:${wk}`,
        type: "high_spending",
        severity: thisWeek > avg * 2 ? "high" : "medium",
        title: "Spending is higher than usual",
        message: `You've spent ${taka(thisWeek)} this week, versus a usual ${taka(avg)}.`,
        weekStart: week,
      });
    }
  }

  // 3. Cash flow: first high-risk week in the latest forecast
  const risky = snapshot?.weeks?.find((w) => w.shortfallRisk === "high");
  if (risky) {
    const rk = new Date(risky.weekStart).toISOString().slice(0, 10);
    out.push({
      key: `cash_flow:${rk}`,
      type: "cash_flow",
      severity: "high",
      title: "Possible shortfall ahead",
      message: `Your forecast shows expenses may exceed income in the week of ${rk}.`,
      weekStart: new Date(risky.weekStart),
    });
  }

  // 4. Savings goal due within 14 days and not funded
  for (const g of goals) {
    const left = g.targetDate.getTime() - now.getTime();
    const remaining = g.targetAmount - g.savedAmount;
    if (left > 0 && left <= 14 * DAY && remaining > 0) {
      out.push({
        key: `goal_due:${g._id}`,
        type: "savings_goal",
        severity: "medium",
        title: `"${g.title}" is due soon`,
        message: `${taka(remaining)} still needed by ${g.targetDate.toISOString().slice(0, 10)}.`,
        relatedGoal: g._id,
      });
    }
  }

  // 5. Unusual expense: last 7 days, over 3x your median expense
  const recent = expenses.filter(
    (t) => t.date >= new Date(now.getTime() - 7 * DAY),
  );
  const older = expenses.filter(
    (t) => t.date < new Date(now.getTime() - 7 * DAY),
  );
  if (older.length >= 5) {
    const med = median(older.map((t) => t.amount));
    for (const t of recent) {
      if (t.amount > med * 3) {
        out.push({
          key: `unusual:${t._id}`,
          type: "unusual_spending",
          severity: "medium",
          title: "Unusually large expense",
          message: `${taka(t.amount)} on ${t.category}${t.description ? ` (${t.description})` : ""} is much higher than your usual expense.`,
        });
      }
    }
  }

  return out;
};

// Inserts only alerts that don't exist yet. Returns how many were created.
export const syncAlerts = async (userId) => {
  const items = await buildCandidates(userId);
  if (!items.length) return 0;

  const res = await Alert.bulkWrite(
    items.map(({ key, ...alert }) => ({
      updateOne: {
        filter: { user: userId, dedupeKey: key },
        update: { $setOnInsert: { ...alert, user: userId, dedupeKey: key } },
        upsert: true,
      },
    })),
  );
  return res.upsertedCount;
};
