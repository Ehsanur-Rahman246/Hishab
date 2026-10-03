import express from "express";
import {
  analyzeTransactions,
  askCoach,
  checkAiHealth,
  getLatestInsights,
} from "../controllers/aiControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { coachRateLimit } from "../middleware/rateLimit.js";

const aiRouter = express.Router();

// GET /api/ai/health -> proxies FastAPI GET /health
aiRouter.get("/health", authMiddleware, checkAiHealth);

// POST /api/ai/analyze -> analyzes the logged-in user's own transactions.
// Never accepts userId or transactions from the request body.
aiRouter.post("/analyze", authMiddleware, analyzeTransactions);

// GET /api/ai/latest-insights -> latest saved ForecastSnapshot for this user.
aiRouter.get("/latest-insights", authMiddleware, getLatestInsights);

// POST /api/ai/coach -> bilingual AI Financial Coach (Groq via backend only).
// Body: { message, language? }. Rate-limited per user.
aiRouter.post("/coach", authMiddleware, coachRateLimit, askCoach);

export default aiRouter;
