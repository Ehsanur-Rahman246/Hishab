import express from "express";
import {
  getArmAssignment,
  getArms,
  getExperimentOutcomes,
  getSyntheticResults,
  postExperimentEvent,
} from "../controllers/experimentControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";

const experimentRouter = express.Router();

experimentRouter.get("/arms", authMiddleware, getArms);
experimentRouter.get("/arm-assignment", authMiddleware, getArmAssignment);
experimentRouter.post("/events", authMiddleware, postExperimentEvent);
experimentRouter.get("/synthetic-results", authMiddleware, getSyntheticResults);
experimentRouter.get("/outcomes", authMiddleware, getExperimentOutcomes);

export default experimentRouter;
