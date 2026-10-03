import express from "express";
import {
  getMessages,
  getOneMessage,
  deleteMessage,
  deleteMessages,
} from "../controllers/chatControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const chatRouter = express.Router();
chatRouter.param("id", validateIdParam);

chatRouter.get("/", authMiddleware, getMessages);

chatRouter.delete("/", authMiddleware, deleteMessages);

chatRouter.get("/:id", authMiddleware, getOneMessage);

chatRouter.delete("/:id", authMiddleware, deleteMessage);

export default chatRouter;
