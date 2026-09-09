import { findAccountCreatedAt, findMissedActivitySources } from "../repositories/missedActivityRepository.js";
import { AppError } from "../utils/appError.js";
import { getTodayDateKey, isCalendarDateKey, shiftDateKey } from "../utils/dateKey.js";
import { markMissedDaysAsNo } from "./checkInService.js";

export { isCalendarDateKey };

export const MISSED_ACTIVITY_ORDER = ["STRONG", "READING", "GOALS"];

export const MISSED_ACTIVITY_LIMIT = 30;

export function collectMissedDateKeys(recordedDateKeys, { createdDateKey, todayDateKey }) {
  if (!isCalendarDateKey(createdDateKey) || !isCalendarDateKey(todayDateKey)) return [];

  const recorded = new Set(recordedDateKeys || []);
  const missed = [];
  let cursor = createdDateKey;

  while (cursor && cursor < todayDateKey) {
    if (!recorded.has(cursor)) missed.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }

  return missed;
}

function toDateKeySet(rows) {
  return new Set((rows || []).flatMap((row) => (row?.dateKey ? [row.dateKey] : [])));
}

export function buildMissedActivityItems(
  { todayDateKey, createdDateKey, recovery, reading, goals },
  { offset = 0, limit = MISSED_ACTIVITY_LIMIT } = {},
) {
  const day = { createdDateKey, todayDateKey };
  const missedByActivity = {
    STRONG: new Set(collectMissedDateKeys(toDateKeySet(recovery), day)),
    READING: new Set(collectMissedDateKeys(toDateKeySet(reading), day)),
    GOALS: new Set(collectMissedDateKeys(toDateKeySet(goals), day)),
  };

  const dateKeys = [...new Set(MISSED_ACTIVITY_ORDER.flatMap((activity) => [...missedByActivity[activity]]))].sort();
  const items = [];

  for (const dateKey of dateKeys) {
    for (const activity of MISSED_ACTIVITY_ORDER) {
      if (missedByActivity[activity].has(dateKey)) items.push({ dateKey, activity });
    }
  }

  return { total: items.length, items: items.slice(offset, offset + limit) };
}

export function assertHistoricalDateKey(dateKey, { todayDateKey, createdDateKey }) {
  if (!isCalendarDateKey(dateKey)) {
    throw new AppError("Choose a valid date", 400);
  }
  if (dateKey >= todayDateKey) {
    throw new AppError("You can only complete a day that has already ended", 400);
  }
  if (createdDateKey && dateKey < createdDateKey) {
    throw new AppError("That day is before your account was created", 400);
  }

  return dateKey;
}

export async function getHistoricalDayContext(userId, timezone, { now = new Date(), client } = {}) {
  const createdAt = await findAccountCreatedAt(userId, client);
  const todayDateKey = getTodayDateKey(now, timezone);

  return {
    todayDateKey,
    createdDateKey: createdAt ? getTodayDateKey(createdAt, timezone) : todayDateKey,
  };
}

export async function getMissedActivities(
  userId,
  timezone,
  { now = new Date(), client, offset = 0, limit = MISSED_ACTIVITY_LIMIT } = {},
) {
  await markMissedDaysAsNo(userId, timezone, now);

  const sources = await findMissedActivitySources(userId, client);
  const todayDateKey = getTodayDateKey(now, timezone);
  const createdDateKey = sources.createdAt ? getTodayDateKey(sources.createdAt, timezone) : todayDateKey;

  return buildMissedActivityItems(
    {
      todayDateKey,
      createdDateKey,
      recovery: sources.recovery,
      reading: sources.reading,
      goals: sources.goals,
    },
    { offset, limit },
  );
}
