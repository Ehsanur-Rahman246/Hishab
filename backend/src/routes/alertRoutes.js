import express from "express";
import {
  getAlerts,
  getOneAlert,
  markAsRead,
  markAllAsRead,
  resolveAlert,
  deleteAlert,
  refreshAlerts,
} from "../controllers/alertControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const alertRouter = express.Router();
alertRouter.param("id", validateIdParam);

alertRouter.get("/", authMiddleware, getAlerts);

alertRouter.post("/refresh", authMiddleware, refreshAlerts);

alertRouter.get("/:id", authMiddleware, getOneAlert);

alertRouter.patch("/:id/read", authMiddleware, markAsRead);

alertRouter.patch("/read-all", authMiddleware, markAllAsRead);

alertRouter.patch("/:id/resolve", authMiddleware, resolveAlert);

alertRouter.delete("/:id", authMiddleware, deleteAlert);

export default alertRouter;
