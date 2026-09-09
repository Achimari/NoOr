import { normalizeStoredPassage } from "../data/bible.js";
import {
  createReadingCheckIn,
  findReadingCheckIn,
  upsertReadingCheckIn,
} from "../repositories/readingCheckInRepository.js";
import { AppError } from "../utils/appError.js";
import { getNextResetAt, getTodayDateKey } from "../utils/dateKey.js";
import { assertHistoricalDateKey, getHistoricalDayContext } from "./missedActivityService.js";
import { reconcileRewardsForDate } from "./progressionService.js";

function buildStatus(checkIn, { dateKey, nextResetAt }) {
  if (!checkIn) {
    return {
      canAnswer: true,
      answeredToday: false,
      answer: null,
      dateKey,
      nextResetAt,
      passages: [],
      reflection: null,
    };
  }

  return {
    canAnswer: false,
    answeredToday: true,
    answer: checkIn.answer,
    dateKey,
    nextResetAt,
    passages: (checkIn.passages || []).map(normalizeStoredPassage),
    reflection: checkIn.reflection || null,
  };
}

export async function getReadingCheckInStatus(userId, timezone) {
  const dateKey = getTodayDateKey(new Date(), timezone);
  const nextResetAt = getNextResetAt(new Date(), timezone).toISOString();
  const checkIn = await findReadingCheckIn({ userId, dateKey });

  return buildStatus(checkIn, { dateKey, nextResetAt });
}

export async function createTodayReadingCheckIn(userId, timezone, { answer, passages, reflection }) {
  const dateKey = getTodayDateKey(new Date(), timezone);
  const nextResetAt = getNextResetAt(new Date(), timezone).toISOString();
  const checkIn = await createReadingCheckIn({ userId, dateKey, answer, reflection, passages });

  if (!checkIn) {
    throw new AppError("Already answered the reading check today", 409);
  }

  await reconcileRewardsForDate(userId, dateKey);

  return buildStatus(checkIn, { dateKey, nextResetAt });
}

export async function createMissedReadingCheckIn(userId, timezone, { dateKey, answer, passages, reflection }, { now = new Date(), client } = {}) {
  const day = await getHistoricalDayContext(userId, timezone, { now, client });
  assertHistoricalDateKey(dateKey, day);

  const checkIn = await createReadingCheckIn({ userId, dateKey, answer, reflection, passages }, client);

  if (!checkIn) {
    throw new AppError("That day already has a reading answer", 409);
  }

  await reconcileRewardsForDate(userId, dateKey, client);

  return buildStatus(checkIn, { dateKey, nextResetAt: null });
}

export async function updateTodayReadingCheckIn(userId, timezone, { answer, passages, reflection }) {
  const dateKey = getTodayDateKey(new Date(), timezone);
  const nextResetAt = getNextResetAt(new Date(), timezone).toISOString();
  const checkIn = await upsertReadingCheckIn({ userId, dateKey, answer, reflection, passages });

  await reconcileRewardsForDate(userId, dateKey);

  return buildStatus(checkIn, { dateKey, nextResetAt });
}
