import Transaction from "../models/Transaction.js";
import ForecastSnapshot from "../models/ForecastSnapshot.js";
import Wallet from "../models/Wallet.js";

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
const fetchWithTimeout = async (url, options = {}, timeoutMs = AI_TIMEOUT_MS) => {
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

    return {
      weekStart,
      predictedInflow: inflow,
      predictedOutflow: outflow,
      predictedBalance: runningBalance,
      shortfallRisk: VALID_RISKS.includes(w?.risk) ? w.risk : "low",
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
          "AI service could not analyze these transactions."
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
