import express from "express";
import {
  analyzeTransactions,
  askCoach,
  checkAiHealth,
  getLatestInsights,
} from "../controllers/aiControllers.js";
import {
  cancelGoalAddMoneyToken,
  confirmGoalAddMoney,
  confirmGoalAddMoneyToken,
  confirmGoalDelete,
  proposeGoalAddMoney,
  requestGoalDelete,
} from "../controllers/aiGoalControllers.js";
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

// Goal actions via chat: deterministic, JWT-scoped, confirmation-gated.
// request proposes (never deletes); confirm executes via the shared
// executeGoalDeletion service. Both rate-limited like coach.
aiRouter.post("/goals/delete-request", authMiddleware, coachRateLimit, requestGoalDelete);
aiRouter.post("/goals/delete-confirm", authMiddleware, coachRateLimit, confirmGoalDelete);

// Chat add-money: explicit goal choice for an ambiguous command.
// All checks + money movement run server-side via executeManualContribution.
aiRouter.post("/goals/add-money-confirm", authMiddleware, coachRateLimit, confirmGoalAddMoney);

// Confirm-first token flow: propose is read-only; confirm-token moves money
// once (user-bound, action-bound, short-lived, one-time-use, server-validated).
aiRouter.post("/goals/add-money-propose", authMiddleware, coachRateLimit, proposeGoalAddMoney);
aiRouter.post("/goals/add-money-confirm-token", authMiddleware, coachRateLimit, confirmGoalAddMoneyToken);
aiRouter.post("/goals/add-money-cancel-token", authMiddleware, coachRateLimit, cancelGoalAddMoneyToken);

export default aiRouter;
