import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import ForecastSnapshot from "../models/ForecastSnapshot.js";
import Wallet from "../models/Wallet.js";
import Goal from "../models/Goal.js";
import ChatMessage from "../models/ChatMessage.js";
import {
  COACH_REQUEST_LANGUAGES,
  generateCoachReply,
  parseAndValidateCoachJson,
} from "../services/groqCoachService.js";

// Base URL of the FastAPI AI service.
// Set AI_SERVICE_URL in backend/.env. Falls back to local default for dev.
const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// How long to wait for FastAPI before giving up (hackathon-friendly: 10s).
const AI_TIMEOUT_MS = 10_000;

// If the user hits "refresh" twice within this window, we update the fresh
// snapshot instead of creating a duplicate. Older history is never deleted.
const SNAPSHOT_DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Allowed values for ForecastSnapshot.weeks[].shortfallRisk.
const VALID_RISKS = ["low", "medium", "high"];

// Helper: Node's built-in fetch + a timeout via AbortController.
// No extra dependency (no axios) needed.
const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = AI_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Helper: read a FastAPI error body safely and pull out a clean message.
// Never forwards stack traces to the client.
const readAiErrorMessage = async (aiRes, fallback) => {
  try {
    const data = await aiRes.json();

    // FastAPI validation errors look like: { detail: [...] or "msg" }
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      const first = data.detail[0];
      if (first?.msg) return `AI service validation failed: ${first.msg}`;
      return "AI service rejected the transaction data.";
    }
    if (typeof data?.message === "string") return data.message;

    return fallback;
  } catch {
    return fallback;
  }
};

// Helper: convert FastAPI forecast weeks into ForecastSnapshot subdocuments.
// predictedBalance is built cumulatively: opening wallet balance + each
// week's (predictedIncome - predictedExpense). The ML "net cashflow" is a
// weekly delta and must never be stored as if it were a real balance.
const toSnapshotWeeks = (forecastWeeks, openingBalance) => {
  if (!Array.isArray(forecastWeeks) || forecastWeeks.length === 0) {
    throw new Error("AI response contained no forecast weeks.");
  }

  let runningBalance = Number(openingBalance) || 0;

  return forecastWeeks.map((w, i) => {
    const weekStart = new Date(w?.weekStart);
    const inflow = Number(w?.predictedIncome);
    const outflow = Number(w?.predictedExpense);

    if (Number.isNaN(weekStart.getTime())) {
      throw new Error(`AI forecast week ${i} has an invalid weekStart.`);
    }
    if (!Number.isFinite(inflow) || inflow < 0) {
      throw new Error(`AI forecast week ${i} has an invalid predictedIncome.`);
    }
    if (!Number.isFinite(outflow) || outflow < 0) {
      throw new Error(`AI forecast week ${i} has an invalid predictedExpense.`);
    }

    runningBalance += inflow - outflow;

    const mlRisk = VALID_RISKS.includes(w?.risk) ? w.risk : "low";

    return {
      weekStart,
      predictedInflow: inflow,
      predictedOutflow: outflow,
      predictedBalance: runningBalance,
      // a negative predicted balance is always a high shortfall risk
      shortfallRisk: runningBalance < 0 ? "high" : mlRisk,
    };
  });
};

// POST /api/ai/analyze (protected)
// NOTE: never reads userId or transactions from req.body.
// The user is identified only via req.user.userId (JWT cookie),
// and transactions are always loaded from MongoDB for that user.
export const analyzeTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Load only the fields the AI service needs, oldest first.
    // .lean() returns plain JS objects (faster + JSON-safe).
    const transactions = await Transaction.find({ user: userId })
      .select("type category amount date description -_id")
      .sort({ date: 1 })
      .lean();

    if (!transactions || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one transaction before generating AI insights.",
      });
    }

    let aiRes;
    try {
      aiRes = await fetchWithTimeout(`${AI_SERVICE_URL}/analyze-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: String(userId), transactions }),
      });
    } catch (error) {
      // AbortError = our 10s timeout fired. TypeError = connection refused/down.
      console.error("AI service request failed:", error);

      if (error?.name === "AbortError") {
        return res.status(503).json({
          success: false,
          message: "AI service timed out. Please try again in a moment.",
        });
      }

      return res.status(503).json({
        success: false,
        message: "AI service is currently unavailable. Please try again later.",
      });
    }

    if (!aiRes.ok) {
      console.error("AI service error status:", aiRes.status);

      // Forward FastAPI validation problems (400/422) with a clean message.
      if (aiRes.status === 400 || aiRes.status === 422) {
        const message = await readAiErrorMessage(
          aiRes,
          "AI service could not analyze these transactions.",
        );
        return res.status(aiRes.status).json({ success: false, message });
      }

      return res.status(503).json({
        success: false,
        message: "AI service is currently unavailable. Please try again later.",
      });
    }

    // Success: return the exact analysis object FastAPI produced.
    const analysis = await aiRes.json();

    // Persist a ForecastSnapshot so the dashboard can show the latest
    // forecast without calling the AI service again. If saving fails we
    // return a clear error instead of pretending it was saved.
    try {
      const forecast = analysis?.mlInsights?.forecast;
      const rawModel = analysis?.mlInsights?.modelUsed;
      const modelUsed =
        typeof rawModel === "string" && rawModel.trim()
          ? rawModel.trim()
          : "unknown";

      // The user's CURRENT wallet balance is the only real starting point.
      // FastAPI's estimatedNetCashflow is a weekly delta, never a balance.
      const wallet = await Wallet.findOne({ user: userId })
        .select("balance")
        .lean();
      const openingBalance =
        wallet && Number.isFinite(Number(wallet.balance))
          ? Number(wallet.balance)
          : 0;

      const weeks = toSnapshotWeeks(forecast?.weeks, openingBalance);
      const horizonWeeks = Number.isFinite(Number(forecast?.horizonWeeks))
        ? Number(forecast.horizonWeeks)
        : weeks.length;

      // Deduplication: refresh a snapshot made minutes ago for this user
      // instead of stacking duplicates. Historical snapshots are kept.
      const recent = await ForecastSnapshot.findOne({ user: userId }).sort({
        generatedAt: -1,
      });

      let snapshot;
      if (
        recent &&
        Date.now() - new Date(recent.generatedAt).getTime() <
          SNAPSHOT_DEDUP_WINDOW_MS
      ) {
        recent.weeks = weeks;
        recent.modelUsed = modelUsed;
        recent.horizonWeeks = horizonWeeks;
        recent.generatedAt = new Date();
        snapshot = await recent.save();
      } else {
        snapshot = await ForecastSnapshot.create({
          user: userId,
          modelUsed,
          horizonWeeks,
          weeks,
        });
      }

      // Backward-compatible: every previous field is untouched, one added.
      analysis.savedForecastId = String(snapshot._id);
      return res.status(200).json(analysis);
    } catch (error) {
      console.error("Failed to save forecast snapshot:", error);

      return res.status(500).json({
        success: false,
        message:
          "AI analysis succeeded, but saving the forecast failed. Please try again.",
      });
    }
  } catch (error) {
    // Log details server-side only; clients get a generic message.
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GET /api/ai/latest-insights (protected)
// Returns the latest saved ForecastSnapshot for the logged-in user only.
// 404 when the user has never generated insights (frontend shows empty state).
export const getLatestInsights = async (req, res) => {
  try {
    const userId = req.user.userId;

    const snapshot = await ForecastSnapshot.findOne({ user: userId })
      .sort({ generatedAt: -1 })
      .lean();

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message:
          "No saved insights yet. Generate your first AI insight to see your forecast.",
      });
    }

    return res.status(200).json({
      success: true,
      forecast: snapshot,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Helper: build the compact, trusted context sent to Groq.
// Aggregates only — the full raw transaction list is NEVER included,
// and neither is any PII (no emails, phones, passwords, tokens, or secrets).
const buildCoachContext = async (userId) => {
  const userOid = new mongoose.Types.ObjectId(userId);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [totalsAgg, topCats, snapshot, goals, history, notable] =
    await Promise.all([
      // Total income vs expense for this user.
      Transaction.aggregate([
        { $match: { user: userOid } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
      // Top 5 spending categories.
      Transaction.aggregate([
        { $match: { user: userOid, type: "expense" } },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),
      // Latest saved ML forecast (may be null for new users).
      ForecastSnapshot.findOne({ user: userId })
        .sort({ generatedAt: -1 })
        .lean(),
      // Active goals only (max 5, no plan internals).
      Goal.find({ user: userId, status: "active" })
        .select("title targetAmount savedAmount targetDate")
        .limit(5)
        .lean(),
      // Latest 8 chat messages, oldest first, role + text only.
      ChatMessage.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("role text")
        .lean(),
      // Largest recent expenses (honestly labelled below: these are NOT
      // ML anomaly flags, just the biggest recent purchases).
      Transaction.find({
        user: userId,
        type: "expense",
        date: { $gte: sixtyDaysAgo },
      })
        .sort({ amount: -1 })
        .limit(5)
        .select("category amount date description")
        .lean(),
    ]);

  const totalOf = (type) =>
    Number(totalsAgg.find((t) => t._id === type)?.total) || 0;

  return {
    totals: {
      income: totalOf("income"),
      expense: totalOf("expense"),
      currency: "BDT",
    },
    topCategories: topCats.map((c) => ({
      category: String(c._id),
      amount: Number(c.total) || 0,
    })),
    forecast: snapshot
      ? {
          modelUsed: snapshot.modelUsed,
          horizonWeeks: snapshot.horizonWeeks,
          generatedAt:
            snapshot.generatedAt instanceof Date
              ? snapshot.generatedAt.toISOString()
              : String(snapshot.generatedAt),
          weeks: (snapshot.weeks || []).map((w) => ({
            weekStart:
              w.weekStart instanceof Date
                ? w.weekStart.toISOString().slice(0, 10)
                : String(w.weekStart).slice(0, 10),
            inflow: Number(w.predictedInflow) || 0,
            outflow: Number(w.predictedOutflow) || 0,
            balance: Number(w.predictedBalance) || 0,
            risk: w.shortfallRisk,
          })),
        }
      : null,
    notableExpenses: notable.map((t) => ({
      date:
        t.date instanceof Date
          ? t.date.toISOString().slice(0, 10)
          : String(t.date).slice(0, 10),
      category: t.category ? String(t.category) : "",
      amount: Number(t.amount) || 0,
      description: t.description ? String(t.description) : "",
      note: "Largest recent expense, not an ML anomaly flag.",
    })),
    goals: goals.map((g) => ({
      title: g.title,
      targetAmount: Number(g.targetAmount) || 0,
      savedAmount: Number(g.savedAmount) || 0,
      targetDate:
        g.targetDate instanceof Date
          ? g.targetDate.toISOString().slice(0, 10)
          : String(g.targetDate).slice(0, 10),
    })),
    history: history
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, text: String(m.text).slice(0, 500) })),
  };
};

// Bangla Unicode block for the deterministic no-data fallback language pick.
const FALLBACK_BANGLA_RANGE = /[\u0980-\u09FF]/;
const FALLBACK_LATIN_RANGE = /[A-Za-z]/;

// Common Bangla words written in Latin script (Banglish). Used only for the
// local no-data fallback so an "auto" Banglish question gets a mixed reply
// instead of a pure-English one. The live Groq path lets the model decide.
const BANGLISH_HINT =
  /\b(amar|amader|tomar|apnar|apni|tumi|ki|kivabe|keno|koto|kototuku|jomano|joma|kharcha|khoroch|maas|mash|soptaho|dine|protidin|bazaar|bhat|bari|basa|eid|puja|boishakh)\b/i;

// Pick the reply language for the local no-data fallback.
// Explicit bn/en are honored; "auto" matches the message like the live coach:
// Bangla script -> bn, Bangla+Latin mix or Banglish -> mixed, else en.
const pickFallbackLanguage = (requestedLanguage, message) => {
  if (requestedLanguage === "bn" || requestedLanguage === "en") {
    return requestedLanguage;
  }
  const hasBangla = FALLBACK_BANGLA_RANGE.test(message);
  const hasLatin = FALLBACK_LATIN_RANGE.test(message);
  if (hasBangla && hasLatin) return "mixed";
  if (hasBangla) return "bn";
  if (BANGLISH_HINT.test(message)) return "mixed";
  return "en";
};

// Deterministic local reply for users with zero transactions.
// Same { coach } shape as the live endpoint, so the UI renders unchanged.
// Never calls the provider and is never saved to ChatMessage.
const buildNoDataCoach = (requestedLanguage, message) => {
  const language = pickFallbackLanguage(requestedLanguage, message);

  if (language === "bn") {
    return {
      language: "bn",
      headline: "এখনো কোনো লেনদেন যোগ হয়নি",
      answer:
        "আপনার অ্যাকাউন্টে এখনো কোনো লেনদেন নেই, তাই আমি এখনো ব্যক্তিগত বিশ্লেষণ দিতে পারছি না। নিচের ধাপগুলো শেষ করে আবার জিজ্ঞেস করুন।",
      actions: [
        {
          title: "আয় যোগ করুন",
          detail:
            "Transactions পেজে গিয়ে আপনার প্রথম আয় (যেমন বেতন) যোগ করুন।",
        },
        {
          title: "প্রতিদিনের খরচ যোগ করুন",
          detail:
            "খাবার ও যাতায়াতসহ কয়েক দিনের ছোট ছোট খরচ যোগ করুন।",
        },
        {
          title: "Refresh Insights চাপুন",
          detail:
            "লেনদেন যোগ করার পর AI Assistant পেজে Refresh Insights চাপুন, তারপর আবার প্রশ্ন করুন।",
        },
      ],
      tone: "neutral",
      disclaimer:
        "এটি আপনার অতীত লেনদেনের ভিত্তিতে একটি আনুমানিক ব্যাখ্যা, আর্থিক পরামর্শ নয়।",
    };
  }

  if (language === "mixed") {
    return {
      language: "mixed",
      headline: "Ekhono kono transaction nei",
      answer:
        "Apnar account-e ekhono kono transaction add hoyni, tai ami ekhono personal analysis dite parchi na. Nicher step-gulo complete kore abar ask korun.",
      actions: [
        {
          title: "Income add korun",
          detail: "Transactions page-e giye apnar prothom income (jemon salary) add korun.",
        },
        {
          title: "Daily khoroch add korun",
          detail: "Khabar o jatayat-soho koyek diner chhoto chhoto khoroch add korun.",
        },
        {
          title: "Refresh Insights press korun",
          detail:
            "Transaction add korar por AI Assistant page-e Refresh Insights press korun, tarpor abar question korun.",
        },
      ],
      tone: "neutral",
      disclaimer:
        "Eta apnar past transaction-er upor base kore ekta estimate, financial advice na.",
    };
  }

  return {
    language: "en",
    headline: "No transactions yet",
    answer:
      "Your account has no transactions so far, so I cannot give a personal analysis yet. Complete the steps below, then ask me again.",
    actions: [
      {
        title: "Add your income",
        detail:
          "Go to the Transactions page and add your first income, such as your salary.",
      },
      {
        title: "Add daily expenses",
        detail:
          "Add a few days of small expenses, including food and transport.",
      },
      {
        title: "Click Refresh Insights",
        detail:
          "After adding transactions, click Refresh Insights on the AI Assistant page, then ask your question again.",
      },
    ],
    tone: "neutral",
    disclaimer:
      "This is an estimate based on past transactions, not financial advice.",
  };
};

// POST /api/ai/coach (protected)
// Bilingual AI Financial Coach. Accepts ONLY { message, language }.
// The user is identified via req.user.userId; all context is built
// server-side from that user's own data. Nothing else is trusted.
export const askCoach = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { message: rawMessage, language: rawLanguage } = req.body ?? {};

    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    const message = rawMessage.trim();
    if (message.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Message must be at most 500 characters.",
      });
    }

    const language =
      rawLanguage === undefined
        ? "auto"
        : String(rawLanguage).trim().toLowerCase();
    if (!COACH_REQUEST_LANGUAGES.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Language must be one of: auto, bn, en.",
      });
    }

    // No-data fallback: never call the provider when there is nothing to
    // analyze. This deterministic reply is not saved to chat history.
    const transactionCount = await Transaction.countDocuments({
      user: userId,
    });
    if (transactionCount === 0) {
      return res
        .status(200)
        .json({ success: true, coach: buildNoDataCoach(language, message) });
    }

    if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) {
      return res.status(503).json({
        success: false,
        message:
          "AI coach is not configured right now. Please try again later.",
      });
    }

    const context = await buildCoachContext(userId);

    let rawReply;
    try {
      rawReply = await generateCoachReply({ message, language, context });
    } catch (error) {
      if (error?.code === "NOT_CONFIGURED") {
        return res.status(503).json({
          success: false,
          message:
            "AI coach is not configured right now. Please try again later.",
        });
      }
      if (error?.code === "RATE_LIMITED") {
        return res.status(429).json({
          success: false,
          message:
            "The AI coach is busy right now. Please wait a moment and try again.",
        });
      }
      if (error?.code === "AUTH_ERROR") {
        console.error("AI coach provider auth/permission failure.");
        return res.status(503).json({
          success: false,
          message:
            "AI coach is temporarily unavailable. Please try again in a moment.",
        });
      }
      return res.status(503).json({
        success: false,
        message:
          "AI coach is temporarily unavailable. Please try again in a moment.",
      });
    }

    const checked = parseAndValidateCoachJson(rawReply, language);
    if (!checked.ok) {
      // Never expose raw provider output — just a friendly retry message.
      console.error("Coach model returned unusable output.");
      return res.status(502).json({
        success: false,
        message:
          "The AI coach gave an unclear answer. Please try asking again.",
      });
    }

    // Save history only after successful validation, for this user only.
    // Only the two message texts are stored — never keys, context, or prompts.
    await ChatMessage.create([
      { user: userId, role: "user", text: message },
      { user: userId, role: "assistant", text: checked.coach.answer },
    ]);

    return res.status(200).json({ success: true, coach: checked.coach });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// GET /api/ai/health (protected)
// Proxies FastAPI's GET /health so the frontend can check AI availability
// through the same authenticated backend origin.
export const checkAiHealth = async (req, res) => {
  try {
    let aiRes;
    try {
      aiRes = await fetchWithTimeout(`${AI_SERVICE_URL}/health`, {
        method: "GET",
      });
    } catch (error) {
      console.error("AI health check failed:", error);

      return res.status(503).json({
        success: false,
        message: "AI service is currently unavailable.",
      });
    }

    if (!aiRes.ok) {
      console.error("AI health check bad status:", aiRes.status);

      return res.status(503).json({
        success: false,
        message: "AI service is currently unavailable.",
      });
    }

    const data = await aiRes.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
