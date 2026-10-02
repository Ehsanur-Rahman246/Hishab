import express from "express";
import {
  analyzeTransactions,
  checkAiHealth,
  getLatestInsights,
} from "../controllers/aiControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";

const aiRouter = express.Router();

// GET /api/ai/health -> proxies FastAPI GET /health
aiRouter.get("/health", authMiddleware, checkAiHealth);

// POST /api/ai/analyze -> analyzes the logged-in user's own transactions.
// Never accepts userId or transactions from the request body.
aiRouter.post("/analyze", authMiddleware, analyzeTransactions);

// GET /api/ai/latest-insights -> latest saved ForecastSnapshot for this user.
aiRouter.get("/latest-insights", authMiddleware, getLatestInsights);

export default aiRouter;
