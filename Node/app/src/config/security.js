import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, isProduction } from "./env.js";

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
});

export const corsMiddleware = cors({
  origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) : false,
  credentials: true,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication attempts. Please try again later.",
});
