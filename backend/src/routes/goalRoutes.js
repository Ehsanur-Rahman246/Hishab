import express from "express";
import {
  createGoal,
  getGoals,
  getOneGoal,
  updateGoal,
  deleteGoal,
  selectPlan,
  updatePlan,
  addSavings,
  updateGoalStatus,
  updateGoalAutomation,
  getGoalTransfers,
  runAutomationNow,
} from "../controllers/goalControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const goalRouter = express.Router();
goalRouter.param("id", validateIdParam);

goalRouter.post("/", authMiddleware, createGoal);

goalRouter.get("/", authMiddleware, getGoals);

// Demo/test: currently-due cycle for the logged-in user only.
goalRouter.post("/automation/run-now", authMiddleware, runAutomationNow);

goalRouter.get("/:id", authMiddleware, getOneGoal);

goalRouter.patch("/:id", authMiddleware, updateGoal);

goalRouter.delete("/:id", authMiddleware, deleteGoal);

goalRouter.patch("/:id/select-plan", authMiddleware, selectPlan);

goalRouter.patch("/:id/update-plan", authMiddleware, updatePlan);

goalRouter.post("/:id/add-savings", authMiddleware, addSavings);

goalRouter.patch("/:id/status", authMiddleware, updateGoalStatus);

goalRouter.patch("/:id/automation", authMiddleware, updateGoalAutomation);

goalRouter.get("/:id/transfers", authMiddleware, getGoalTransfers);

export default goalRouter;
