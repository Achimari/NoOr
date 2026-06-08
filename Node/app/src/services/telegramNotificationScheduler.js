import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { sendDailyAnswerReminders, sendDailyPrayerDigest } from "./telegramService.js";

const CHECK_INTERVAL_MS = 60 * 1000;

let schedulerId;

async function runSchedulerTick(now = new Date()) {
  const answerReminderResult = await sendDailyAnswerReminders(now);
  if (answerReminderResult.sent > 0) {
    logger.info({ sent: answerReminderResult.sent }, "Telegram answer reminders sent");
  }

  const prayerDigestResult = await sendDailyPrayerDigest(now);
  if (prayerDigestResult.sent > 0) {
    logger.info({ sent: prayerDigestResult.sent }, "Telegram prayer digest sent");
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
