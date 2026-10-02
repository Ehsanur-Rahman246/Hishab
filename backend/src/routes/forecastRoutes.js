import express from "express";
import {
  getForecasts,
  getOneForecast,
  getLatestForecast,
  createForecast,
  deleteForecast,
} from "../controllers/forecastControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const forecastRouter = express.Router();
forecastRouter.param("id", validateIdParam);

forecastRouter.get("/", authMiddleware, getForecasts);

forecastRouter.get("/latest", authMiddleware, getLatestForecast);

forecastRouter.get("/:id", authMiddleware, getOneForecast);

forecastRouter.post("/", authMiddleware, createForecast);

forecastRouter.delete("/:id", authMiddleware, deleteForecast);

export default forecastRouter;
