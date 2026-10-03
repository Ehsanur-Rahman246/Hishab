import express from "express";
import {
  createTransaction,
  getTransactions,
  deleteTransaction,
  getSingleTransaction,
} from "../controllers/transactionControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { validateIdParam } from "../middleware/validateObjectId.js";

const transactionRouter = express.Router();
transactionRouter.param("id", validateIdParam);

transactionRouter.post("/", authMiddleware, createTransaction);

transactionRouter.get("/", authMiddleware, getTransactions);

transactionRouter.get("/:id", authMiddleware, getSingleTransaction);

transactionRouter.delete("/:id", authMiddleware, deleteTransaction);

export default transactionRouter;
