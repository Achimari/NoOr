import {
  findLeaderboardValueById,
  findTopLeaderboardRows,
} from "../repositories/leaderboardRepository.js";
import { createDailyCheckIn, getWeeklyCheckInDays } from "./checkInService.js";
import { getTodayDateKey } from "../utils/dateKey.js";

function sanitizeLeaderboardEntry(row, index) {
  return {
    rank: index + 1,
    id: row.id,
    name: row.user.name,
    value: row.value,
  };
}

export async function getLeaderboardSummary(userId) {
  const [currentRow, topRows, weekDays] = await Promise.all([
    findLeaderboardValueById(userId),
    findTopLeaderboardRows(),
    getWeeklyCheckInDays(userId),
  ]);

  return {
    current: {
      id: userId,
      value: currentRow?.value || 0,
      todayDateKey: getTodayDateKey(),
      weekDays,
    },
    leaders: topRows.map(sanitizeLeaderboardEntry),
  };
}

export async function incrementUserLeaderboard(userId) {
  await createDailyCheckIn(userId, "YES");
  return getLeaderboardSummary(userId);
}

export async function resetUserLeaderboard(userId) {
  await createDailyCheckIn(userId, "NO");
  return getLeaderboardSummary(userId);
}
