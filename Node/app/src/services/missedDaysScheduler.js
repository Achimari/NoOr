import { env } from "../config/env.js";
import {
  findUsersForMissedDaysSync,
  markUserMissedDaysSynced,
} from "../repositories/checkInRepository.js";
import { getTodayDateKey, getZonedParts } from "../utils/dateKey.js";
import { logger } from "../utils/logger.js";
import { markMissedDaysAsNo } from "./checkInService.js";

const SYNC_INTERVAL_MS = 60 * 60 * 1000;

let schedulerId;
let syncInProgress = false;

function isAtLocalResetHour(user, now) {
  const parts = getZonedParts(now, user.timezone);
  return Number(parts.hour) === env.CHECK_IN_RESET_HOUR;
}

function getPendingUsers(users, now, onlyAtResetHour) {
  return users.flatMap((user) => {
    if (onlyAtResetHour && !isAtLocalResetHour(user, now)) return [];

    const syncDateKey = getTodayDateKey(now, user.timezone);
    if (user.missedDaysSyncDateKey === syncDateKey) return [];

    return [{ ...user, syncDateKey }];
  });
}

export async function syncAllUsersMissedDays(now = new Date(), { onlyAtResetHour = false } = {}) {
  if (syncInProgress) {
    return { processed: 0, failed: 0, skipped: true };
  }

  syncInProgress = true;

  try {
    const users = await findUsersForMissedDaysSync();
    const usersToSync = getPendingUsers(users, now, onlyAtResetHour);
    let processed = 0;
    let failed = 0;

    for (const user of usersToSync) {
      try {
        await markMissedDaysAsNo(user.id, user.timezone, now);
        await markUserMissedDaysSynced(user.id, user.syncDateKey);
        processed += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ err: error, userId: user.id }, "Missed-days sync failed for user");
      }
    }

    return { processed, failed, skipped: false };
  } finally {
    syncInProgress = false;
  }
}

async function runSchedulerTick(options) {
  const result = await syncAllUsersMissedDays(new Date(), options);

  if (!result.skipped) {
    logger.info(
      { processed: result.processed, failed: result.failed },
      "Missed-days sync completed",
    );
  }
}

export async function startMissedDaysScheduler() {
  if (schedulerId) return;

  schedulerId = setInterval(() => {
    runSchedulerTick({ onlyAtResetHour: true }).catch((error) => {
      logger.warn({ err: error }, "Missed-days scheduler failed");
    });
  }, SYNC_INTERVAL_MS);

  schedulerId.unref?.();
  logger.info("Missed-days scheduler started");

  try {
    await runSchedulerTick({ onlyAtResetHour: false });
  } catch (error) {
    logger.warn({ err: error }, "Initial missed-days sync failed");
  }
}

export function stopMissedDaysScheduler() {
  if (!schedulerId) return;

  clearInterval(schedulerId);
  schedulerId = null;
}
