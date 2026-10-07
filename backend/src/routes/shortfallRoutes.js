import express from "express";
import {
  getAggregateImpact,
  getFeedbackReport,
  getOutcome,
  getPlan,
  postEvent,
  postFeedback,
} from "../controllers/shortfallControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";

const shortfallRouter = express.Router();

shortfallRouter.get("/outcome", authMiddleware, getOutcome);
shortfallRouter.get("/plan", authMiddleware, getPlan);
shortfallRouter.post("/events", authMiddleware, postEvent);
shortfallRouter.post("/feedback", authMiddleware, postFeedback);
shortfallRouter.get("/feedback-report", authMiddleware, getFeedbackReport);
shortfallRouter.get("/aggregate-impact", authMiddleware, getAggregateImpact);

export default shortfallRouter;
