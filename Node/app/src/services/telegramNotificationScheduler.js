import { env } from "../config/env.js";
import { getTodayDateKey, getZonedParts } from "../utils/dateKey.js";
import { logger } from "../utils/logger.js";
import { sendDailyAnswerReminders, sendDailyPrayerDigest } from "./telegramService.js";

const CHECK_INTERVAL_MS = 60 * 1000;
const PRAYER_DIGEST_HOUR = 22;

let schedulerId;
let lastAnswerReminderKey;
let lastPrayerDigestKey;

function getReminderHour() {
  return (env.CHECK_IN_RESET_HOUR + 23) % 24;
}

function shouldRunAtHour(parts, hour) {
  return Number(parts.hour) === hour && Number(parts.minute || 0) === 0;
}

async function runSchedulerTick(now = new Date()) {
  const parts = getZonedParts(now);
  const dateKey = getTodayDateKey(now);

  if (shouldRunAtHour(parts, getReminderHour()) && lastAnswerReminderKey !== dateKey) {
    lastAnswerReminderKey = dateKey;
    const result = await sendDailyAnswerReminders(dateKey);
    logger.info({ dateKey, sent: result.sent }, "Telegram answer reminders sent");
  }

  if (shouldRunAtHour(parts, PRAYER_DIGEST_HOUR) && lastPrayerDigestKey !== dateKey) {
    lastPrayerDigestKey = dateKey;
    const result = await sendDailyPrayerDigest(dateKey);
    logger.info({ dateKey, sent: result.sent }, "Telegram prayer digest sent");
  }
}

export function startTelegramNotificationScheduler() {
  if (schedulerId || !env.TELEGRAM_BOT_TOKEN) return;

  schedulerId = setInterval(() => {
    runSchedulerTick().catch((error) => {
      logger.warn({ err: error }, "Telegram notification scheduler failed");
    });
  }, CHECK_INTERVAL_MS);

  schedulerId.unref?.();
  runSchedulerTick().catch((error) => {
    logger.warn({ err: error }, "Telegram notification scheduler failed");
  });
  logger.info("Telegram notification scheduler started");
}

export function stopTelegramNotificationScheduler() {
  if (!schedulerId) return;

  clearInterval(schedulerId);
  schedulerId = null;
}

export const schedulerInternals = {
  runSchedulerTick,
};
