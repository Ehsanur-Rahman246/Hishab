import express from "express";
import {
  getWallet,
  addMoney,
  withdrawMoney,
} from "../controllers/walletControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";

const walletRouter = express.Router();

walletRouter.get("/", authMiddleware, getWallet);

walletRouter.post("/add-money", authMiddleware, addMoney);

walletRouter.post("/withdraw", authMiddleware, withdrawMoney);

export default walletRouter;
