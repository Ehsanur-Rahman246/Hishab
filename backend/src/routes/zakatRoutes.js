import express from "express";
import { calculateZakatEstimate } from "../controllers/zakatControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";

const zakatRouter = express.Router();

// POST /api/zakat/calculate -> stateless deterministic Zakat estimate.
// JWT cookie required. Nothing is persisted; nothing from the body is trusted
// beyond the calculation inputs (never a user ID).
zakatRouter.post("/calculate", authMiddleware, calculateZakatEstimate);

export default zakatRouter;
