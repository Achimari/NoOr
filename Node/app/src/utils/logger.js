import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "passwordHash",
      "sessionToken",
      "sessionTokenHash",
      "token",
      "TELEGRAM_BOT_TOKEN",
    ],
    remove: true,
  },
});

export const requestLogger = pinoHttp({
  logger,
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
});
