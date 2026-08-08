import {
  calculateInactiveDays,
  calculateCurrentStreak,
  calculateMaxStreak,
  findMissedDaysByUserIds,
  findUsersWithCheckInHistory,
} from "../repositories/checkInRepository.js";
import { createDailyCheckIn, getCheckInStatus, getWeeklyCheckInDays, markMissedDaysAsNo } from "./checkInService.js";
import { getTodayDateKey } from "../utils/dateKey.js";

const INACTIVE_TAG_MIN_DAYS = 1;

function sanitizeMissedDays(row) {
  const dates = [...(row?.dates || [])].sort();

  return {
    count: row?.count || dates.length,
    dates,
    nextDateKey: dates[0] || null,
  };
}

function sanitizeLeaderboardEntry(row, index, missedDaysByUserId) {
  return {
    rank: index + 1,
    id: row.id,
    name: row.name,
    value: row.value,
    maxStreak: row.maxStreak || 0,
    inactiveDays: row.inactiveDays,
    isInactive: row.inactiveDays >= INACTIVE_TAG_MIN_DAYS,
    missedDays: sanitizeMissedDays(missedDaysByUserId.get(row.id)),
  };
}

function toLeaderboardRow(user, now) {
  const historyRows = user.checkInHistory || [];
  const todayDateKey = getTodayDateKey(now, user.timezone);
  const createdDateKey = getTodayDateKey(user.createdAt, user.timezone);
  const inactiveDays = calculateInactiveDays(historyRows, todayDateKey, createdDateKey);

  return {
    id: user.id,
    name: user.name,
    value: inactiveDays >= INACTIVE_TAG_MIN_DAYS
      ? 0
      : calculateCurrentStreak(historyRows, todayDateKey),
    maxStreak: calculateMaxStreak(historyRows),
    inactiveDays,
  };
}

function sortLeaderboardRows(first, second) {
  if (second.value !== first.value) return second.value - first.value;
  return first.id - second.id;
}

function getOverallBestStreak(rows) {
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

export async function getLeaderboardSummary(userId, timezone, { syncMissedDays = true, weekDays } = {}) {
  const now = new Date();

  if (syncMissedDays) {
    await markMissedDaysAsNo(userId, timezone);
  }

  const [users, resolvedWeekDays] = await Promise.all([
    findUsersWithCheckInHistory(),
    weekDays || getWeeklyCheckInDays(userId, timezone),
  ]);
  const currentHistoryRows = users.find((user) => user.id === userId)?.checkInHistory || [];
  const leaderboardRows = users.map((user) => toLeaderboardRow(user, now)).sort(sortLeaderboardRows);
  const userIds = [...new Set([userId, ...leaderboardRows.map((row) => row.id)])];
  const missedRows = await findMissedDaysByUserIds(userIds);
  const missedDaysByUserId = new Map(missedRows.map((row) => [row.id, row]));
  const todayDateKey = getTodayDateKey(now, timezone);

  return {
    current: {
      id: userId,
      value: calculateCurrentStreak(currentHistoryRows, todayDateKey),
      maxStreak: calculateMaxStreak(currentHistoryRows),
      todayDateKey,
      weekDays: resolvedWeekDays,
      missedDays: sanitizeMissedDays(missedDaysByUserId.get(userId)),
    },
    overallBest: getOverallBestStreak(leaderboardRows),
    leaders: leaderboardRows.map((row, index) => sanitizeLeaderboardEntry(row, index, missedDaysByUserId)),
  };
}

export async function getCheckInOverview(userId, timezone, { syncMissedDays = true } = {}) {
  if (syncMissedDays) {
    await markMissedDaysAsNo(userId, timezone);
  }

  const weekDays = await getWeeklyCheckInDays(userId, timezone);
  const [status, leaderboard] = await Promise.all([
    getCheckInStatus(userId, timezone, { syncMissedDays: false, weekDays }),
    getLeaderboardSummary(userId, timezone, { syncMissedDays: false, weekDays }),
  ]);

  return { status, leaderboard };
}

export async function submitDailyAnswer(userId, answer, timezone) {
  await createDailyCheckIn(userId, answer, timezone);
  return getCheckInOverview(userId, timezone, { syncMissedDays: false });
}
