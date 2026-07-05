import {
  calculateCurrentStreak,
  calculateMaxStreak,
  findMissedDaysByUserIds,
  findUsersWithCheckInHistory,
} from "../repositories/checkInRepository.js";
import { createDailyCheckIn, getCheckInStatus, getWeeklyCheckInDays, markMissedDaysAsNo } from "./checkInService.js";
import { getTodayDateKey } from "../utils/dateKey.js";

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
    missedDays: sanitizeMissedDays(missedDaysByUserId.get(row.id)),
  };
}

function toLeaderboardRow(user) {
  const historyRows = user.checkInHistory || [];

  return {
    id: user.id,
    name: user.name,
    value: calculateCurrentStreak(historyRows),
    maxStreak: calculateMaxStreak(historyRows),
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
  if (syncMissedDays) {
    await markMissedDaysAsNo(userId, timezone);
  }

  const [users, resolvedWeekDays] = await Promise.all([
    findUsersWithCheckInHistory(),
    weekDays || getWeeklyCheckInDays(userId, timezone),
  ]);
  const currentHistoryRows = users.find((user) => user.id === userId)?.checkInHistory || [];
  const leaderboardRows = users.map(toLeaderboardRow).sort(sortLeaderboardRows);
  const userIds = [...new Set([userId, ...leaderboardRows.map((row) => row.id)])];
  const missedRows = await findMissedDaysByUserIds(userIds);
  const missedDaysByUserId = new Map(missedRows.map((row) => [row.id, row]));

  return {
    current: {
      id: userId,
      value: calculateCurrentStreak(currentHistoryRows),
      maxStreak: calculateMaxStreak(currentHistoryRows),
      todayDateKey: getTodayDateKey(new Date(), timezone),
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
