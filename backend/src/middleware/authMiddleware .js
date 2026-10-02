// src/middlewares/userAuth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please log in first",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    // make sure the account still exists (e.g. deleted on another device)
    const userExists = await User.exists({ _id: decoded.userId });

    if (!userExists) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = { userId: decoded.userId };

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export default authMiddleware;
