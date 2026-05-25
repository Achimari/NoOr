import {
  createCheckInAndUpdateLeaderboard,
  findCheckInById,
} from "../repositories/checkInRepository.js";
import { AppError } from "../utils/appError.js";
import { getNextResetAt, getTodayDateKey } from "../utils/dateKey.js";

export async function getCheckInStatus(userId) {
  const dateKey = getTodayDateKey();
  const nextResetAt = getNextResetAt().toISOString();
  const checkIn = await findCheckInById(userId);

  if (!checkIn || checkIn.dateKey !== dateKey || !checkIn.answer) {
    return {
      canAnswer: true,
      answeredToday: false,
      answer: null,
      nextResetAt,
    };
  }

  return {
    canAnswer: false,
    answeredToday: true,
    answer: checkIn.answer,
    nextResetAt,
  };
}

export async function createDailyCheckIn(userId, answer) {
  const dateKey = getTodayDateKey();
  const checkIn = await createCheckInAndUpdateLeaderboard({ userId, dateKey, answer });

  if (!checkIn) {
    throw new AppError("Already answered today", 409);
  }
}
