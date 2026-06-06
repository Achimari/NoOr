import {
  findLeaderboardValueById,
  findTopLeaderboardRows,
} from "../repositories/leaderboardRepository.js";
import { findMissedDaysByUserIds } from "../repositories/checkInRepository.js";
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
    name: row.user.name,
    value: row.value,
    maxStreak: row.maxStreak || 0,
    missedDays: sanitizeMissedDays(missedDaysByUserId.get(row.id)),
  };
}

export async function getLeaderboardSummary(userId, timezone) {
  await markMissedDaysAsNo(userId, timezone);

  const [currentRow, topRows, weekDays] = await Promise.all([
    findLeaderboardValueById(userId),
    findTopLeaderboardRows(),
    getWeeklyCheckInDays(userId, timezone),
  ]);
  const userIds = [...new Set([userId, ...topRows.map((row) => row.id)])];
  const missedRows = await findMissedDaysByUserIds(userIds);
  const missedDaysByUserId = new Map(missedRows.map((row) => [row.id, row]));

  return {
    current: {
      id: userId,
      value: currentRow?.value || 0,
      maxStreak: currentRow?.maxStreak || 0,
      todayDateKey: getTodayDateKey(new Date(), timezone),
      weekDays,
      missedDays: sanitizeMissedDays(missedDaysByUserId.get(userId)),
    },
    leaders: topRows.map((row, index) => sanitizeLeaderboardEntry(row, index, missedDaysByUserId)),
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
