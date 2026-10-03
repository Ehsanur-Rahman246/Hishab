import express from "express";
import {
  deleteAccount,
  getMe,
  login,
  logout,
  register,
} from "../controllers/authControllers.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { loginRateLimit, authRateLimit } from "../middleware/rateLimit.js";

const authRouter = express.Router();

authRouter.post("/register", authRateLimit, register);
authRouter.post("/login", loginRateLimit, login);
authRouter.post("/logout", logout);
authRouter.delete("/delete-account", authMiddleware, authRateLimit, deleteAccount);
authRouter.get("/me", authMiddleware, getMe);

export default authRouter;
