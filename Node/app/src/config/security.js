import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, isProduction } from "./env.js";
import { RATE_LIMITS } from "../domain/constants.js";

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
});

export const corsMiddleware = cors({
  origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) : false,
  credentials: true,
});

function gameRateLimiter({ windowMs, limit }, message) {
  return rateLimit({
    windowMs,
    limit: isProduction ? limit : limit * 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

export const queueRateLimiter = gameRateLimiter(
  RATE_LIMITS.QUEUE_JOIN,
  "You are joining the queue too often. Please wait a moment.",
);

export const spellUnlockRateLimiter = gameRateLimiter(
  RATE_LIMITS.SPELL_UNLOCK,
  "Too many unlock attempts. Please wait a moment.",
);

export const battleActionRateLimiter = gameRateLimiter(
  RATE_LIMITS.BATTLE_ACTION,
  "Too many battle actions. Please slow down.",
);

export const profileWriteRateLimiter = gameRateLimiter(
  RATE_LIMITS.PROFILE_WRITE,
  "Too many profile updates. Please wait a moment.",
);

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication attempts. Please try again later.",
});
