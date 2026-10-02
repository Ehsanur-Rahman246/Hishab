import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Counts failed login attempts per phone number (falls back to IP)
export const loginRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 5, // 5 failed attempts per window
  skipSuccessfulRequests: true, // successful logins don't count
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.phone?.trim() || ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many failed attempts. Try again in 5 minutes",
  },
});

// Optional: general limiter for register
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
