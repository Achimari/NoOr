import {
  calculateCurrentStreak,
  calculateInactiveDays,
  calculateMaxStreak,
} from "../repositories/checkInRepository.js";
import { isUserAnswer, normalizeAnswer, withoutNoData } from "../domain/activityAnswers.js";
import { findGoalStreakRows, findReadingStreakRows } from "../repositories/streakLeaderboardRepository.js";
import { getTodayDateKey } from "../utils/dateKey.js";

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function previousDateKey(dateKey) {
  return shiftDateKey(dateKey, -1);
}

export function nextDateKey(dateKey) {
  return shiftDateKey(dateKey, 1);
}

export function getMissedActivityDays(rows, todayDateKey, createdDateKey) {
  if (!todayDateKey || !createdDateKey || createdDateKey >= todayDateKey) {
    return { count: 0, nextDateKey: null };
  }

  const recordedDateKeys = new Set(
    (rows || []).flatMap((row) => row?.dateKey ? [row.dateKey] : []),
  );
  let cursor = createdDateKey;
  let count = 0;
  let firstMissedDateKey = null;

  while (cursor && cursor < todayDateKey) {
    if (!recordedDateKeys.has(cursor)) {
      count += 1;
      firstMissedDateKey ||= cursor;
    }
    cursor = nextDateKey(cursor);
  }

  return {
    count,
    nextDateKey: firstMissedDateKey,
  };
}

export function normalizeReadingRows(rows) {
  const answerByDateKey = new Map();

  for (const row of rows || []) {
    if (!row?.dateKey || !row.answer) continue;
    if (answerByDateKey.get(row.dateKey) === "YES") continue;
    answerByDateKey.set(row.dateKey, row.answer);
  }

  return [...answerByDateKey.entries()]
    .map(([dateKey, answer]) => ({ dateKey, answer }))
    .sort((first, second) => first.dateKey.localeCompare(second.dateKey));
}

export function calculateReadingCurrentStreak(rows, todayDateKey) {
  return calculateCurrentStreak(normalizeReadingRows(rows), todayDateKey);
}

export function calculateReadingMaxStreak(rows) {
  return calculateMaxStreak(normalizeReadingRows(rows));
}

export function buildGoalDays(rows) {
  const dayByDateKey = new Map();

  for (const row of rows || []) {
    if (!row?.dateKey) continue;
    const day = dayByDateKey.get(row.dateKey) || { dateKey: row.dateKey, total: 0, completed: 0 };
    day.total += 1;
    if (row.completedAt) day.completed += 1;
    dayByDateKey.set(row.dateKey, day);
  }

  return [...dayByDateKey.values()].sort((first, second) => first.dateKey.localeCompare(second.dateKey));
}

export function getSuccessfulGoalDateKeys(rows) {
  return new Set(
    buildGoalDays(rows)
      .filter((day) => day.total > 0 && day.completed === day.total)
      .map((day) => day.dateKey),
  );
}

export function buildGoalHistoryRows(goalRows, checkInRows) {
  const successfulDateKeys = getSuccessfulGoalDateKeys(goalRows);
  const answerByDateKey = new Map();

  for (const row of goalRows || []) {
    if (!row?.dateKey) continue;
    answerByDateKey.set(row.dateKey, successfulDateKeys.has(row.dateKey) ? "YES" : "NO");
  }

  for (const row of checkInRows || []) {
    if (!row?.dateKey) continue;
    if (isUserAnswer(row.answer)) {
      answerByDateKey.set(row.dateKey, row.answer);
      continue;
    }
    if (!answerByDateKey.has(row.dateKey)) answerByDateKey.set(row.dateKey, normalizeAnswer(row.answer));
  }

  return [...answerByDateKey.entries()].map(([dateKey, answer]) => ({ dateKey, answer }));
}

export function calculateGoalCurrentStreak(rows, todayDateKey) {
  const successfulDateKeys = getSuccessfulGoalDateKeys(rows);
  if (!successfulDateKeys.size) return 0;

  let cursor = successfulDateKeys.has(todayDateKey) ? todayDateKey : previousDateKey(todayDateKey);
  let streak = 0;

  while (cursor && successfulDateKeys.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }

  return streak;
}

export function calculateGoalMaxStreak(rows) {
  const successfulDateKeys = [...getSuccessfulGoalDateKeys(rows)].sort();
  let streak = 0;
  let maxStreak = 0;
  let previous = null;

  for (const dateKey of successfulDateKeys) {
    streak = previous && nextDateKey(previous) === dateKey ? streak + 1 : 1;
    maxStreak = Math.max(maxStreak, streak);
    previous = dateKey;
  }

  return maxStreak;
}

export function sortStreakRows(first, second) {
  if (second.value !== first.value) return second.value - first.value;
  if (second.maxStreak !== first.maxStreak) return second.maxStreak - first.maxStreak;

  return first.id - second.id;
}

export function getOverallBestStreak(rows) {
  const bestRow = rows.reduce((best, row) => {
    if (!best || row.maxStreak > best.maxStreak) return row;
    if (row.maxStreak === best.maxStreak && row.id < best.id) return row;
    return best;
  }, null);

  if (!bestRow || bestRow.maxStreak <= 0) return null;

  return {
    id: bestRow.id,
    name: bestRow.name,
    value: bestRow.maxStreak,
  };
}

export function buildStreakBoard(users, { getRows, getCurrentStreak, getMaxStreak, currentUserId, now }) {
  const rows = users
    .map((user) => {
      const todayDateKey = getTodayDateKey(now, user.timezone);
      const createdDateKey = getTodayDateKey(user.createdAt, user.timezone);
      const userRows = getRows(user);
      const inactiveDays = calculateInactiveDays(withoutNoData(userRows), todayDateKey, createdDateKey);

      return {
        id: user.id,
        name: user.name,
        value: inactiveDays > 0 ? 0 : getCurrentStreak(userRows, todayDateKey),
        maxStreak: getMaxStreak(userRows),
        inactiveDays,
        isInactive: inactiveDays > 0,
        missedDays: getMissedActivityDays(userRows, todayDateKey, createdDateKey),
      };
    })
    .sort(sortStreakRows);

  return {
    currentUserId,
    overallBest: getOverallBestStreak(rows),
    leaders: rows.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      name: row.name,
      value: row.value,
      maxStreak: row.maxStreak,
      inactiveDays: row.inactiveDays,
      isInactive: row.isInactive,
      missedDays: row.missedDays,
    })),
  };
}

export async function getStreakLeaderboards(currentUserId) {
  const now = new Date();
  const [readingUsers, goalUsers] = await Promise.all([
    findReadingStreakRows(),
    findGoalStreakRows(),
  ]);

  return {
    reading: buildStreakBoard(readingUsers, {
      getRows: (user) => user.readingCheckIns,
      getCurrentStreak: calculateReadingCurrentStreak,
      getMaxStreak: calculateReadingMaxStreak,
      currentUserId,
      now,
    }),
    goals: buildStreakBoard(goalUsers, {
      getRows: (user) => user.dailyGoals,
      getCurrentStreak: calculateGoalCurrentStreak,
      getMaxStreak: calculateGoalMaxStreak,
      currentUserId,
      now,
    }),
  };
}
