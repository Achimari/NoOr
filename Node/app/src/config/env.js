import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().min(1).default("session"),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  APP_TIMEZONE: z.string().min(1).default("Europe/Riga"),
  CHECK_IN_RESET_HOUR: z.coerce.number().int().min(0).max(23).default(0),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  CORS_ORIGIN: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
