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
} from "../controllers/goalControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const goalRouter = express.Router();
goalRouter.param("id", validateIdParam);

goalRouter.post("/", authMiddleware, createGoal);

goalRouter.get("/", authMiddleware, getGoals);

goalRouter.get("/:id", authMiddleware, getOneGoal);

goalRouter.patch("/:id", authMiddleware, updateGoal);

goalRouter.delete("/:id", authMiddleware, deleteGoal);

goalRouter.patch("/:id/select-plan", authMiddleware, selectPlan);

goalRouter.patch("/:id/update-plan", authMiddleware, updatePlan);

goalRouter.post("/:id/add-savings", authMiddleware, addSavings);

goalRouter.patch("/:id/status", authMiddleware, updateGoalStatus);

export default goalRouter;
