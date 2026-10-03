import express from "express";
import {
  getSummaries,
  getOneSummary,
  generateSummary,
  deleteSummary,
} from "../controllers/summaryControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const summaryRouter = express.Router();
summaryRouter.param("id", validateIdParam);

summaryRouter.get("/", authMiddleware, getSummaries);

summaryRouter.get("/:id", authMiddleware, getOneSummary);

summaryRouter.post("/generate", authMiddleware, generateSummary);

summaryRouter.delete("/:id", authMiddleware, deleteSummary);

export default summaryRouter;
