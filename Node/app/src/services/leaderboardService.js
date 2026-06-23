import {
  calculateCurrentStreak,
  calculateMaxStreak,
  findCheckInHistoryByUserId,
  findMissedDaysByUserIds,
  findUsersWithCheckInHistory,
} from "../repositories/checkInRepository.js";
import { createDailyCheckIn, getWeeklyCheckInDays, markMissedDaysAsNo } from "./checkInService.js";
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

export async function getLeaderboardSummary(userId, timezone) {
  await markMissedDaysAsNo(userId, timezone);

  const [currentHistoryRows, users, weekDays] = await Promise.all([
    findCheckInHistoryByUserId(userId),
    findUsersWithCheckInHistory(),
    getWeeklyCheckInDays(userId, timezone),
  ]);
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
      weekDays,
      missedDays: sanitizeMissedDays(missedDaysByUserId.get(userId)),
    },
    overallBest: getOverallBestStreak(leaderboardRows),
    leaders: leaderboardRows.map((row, index) => sanitizeLeaderboardEntry(row, index, missedDaysByUserId)),
  };
}

export async function incrementUserLeaderboard(userId, timezone) {
  await createDailyCheckIn(userId, "YES", timezone);
  return getLeaderboardSummary(userId, timezone);
}

export async function resetUserLeaderboard(userId, timezone) {
  await createDailyCheckIn(userId, "NO", timezone);
  return getLeaderboardSummary(userId, timezone);
}
