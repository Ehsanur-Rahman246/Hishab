import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Counts failed login attempts per phone number (falls back to IP)
export const loginRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 5, // 5 failed attempts per window
  skipSuccessfulRequests: true, // successful logins don't count
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
  typeof req.body?.phone === "string" && req.body.phone.trim()
    ? req.body.phone.trim()
    : ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many failed attempts. Try again in 5 minutes",
  },
});

// AI coach limiter: 10 questions per 10 minutes per user (falls back to IP).
// Placed after authMiddleware on the route so req.user is available.
export const coachRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.userId ? String(req.user.userId) : ipKeyGenerator(req.ip),
  message: {
    success: false,
    message:
      "Too many questions. Please wait a few minutes before asking again. / অতিরিক্ত প্রশ্ন করা হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।",
  },
});
export const authRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later",
  },
});
