import {
  addMissedCheckInDates,
  createCheckInAndUpdateLeaderboard,
  findCheckInHistoryByDateKeys,
  findCheckInById,
  findMissedDaysByUserId,
  resolveMissedCheckIn,
} from "../repositories/checkInRepository.js";
import { AppError } from "../utils/appError.js";
import { getNextResetAt, getTodayDateKey } from "../utils/dateKey.js";

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMissedDateKeys(lastDateKey, todayDateKey, { includeLastDate = false } = {}) {
  const lastDate = parseDateKey(lastDateKey);
  const todayDate = parseDateKey(todayDateKey);

  if (!lastDate || !todayDate || lastDate >= todayDate) {
    return [];
  }

  const dateKeys = [];
  const cursor = new Date(lastDate);

  if (!includeLastDate) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  while (cursor < todayDate) {
    dateKeys.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dateKeys;
}

function getCurrentWeekDateKeys() {
  const todayDate = new Date(`${getTodayDateKey()}T12:00:00.000Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  const monday = new Date(todayDate);
  monday.setUTCDate(todayDate.getUTCDate() - mondayOffset);

  return WEEK_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);

    return {
      label,
      dateKey: formatDateKey(date),
    };
  });
}

export async function getWeeklyCheckInDays(userId) {
  const weekDays = getCurrentWeekDateKeys();
  const dateKeys = weekDays.map((day) => day.dateKey);
  const [rows, missedDays] = await Promise.all([
    findCheckInHistoryByDateKeys(userId, dateKeys),
    findMissedDaysByUserId(userId),
  ]);
  const rowsByDateKey = new Map(rows.map((row) => [row.dateKey, row.answer]));
  const missedDateKeys = new Set(missedDays?.dates || []);

  return weekDays.map((day) => ({
    ...day,
    answer: rowsByDateKey.get(day.dateKey) || null,
    missed: missedDateKeys.has(day.dateKey),
    successful: rowsByDateKey.get(day.dateKey) === "YES",
  }));
}

export async function markMissedDaysAsNo(userId) {
  const dateKey = getTodayDateKey();
  const checkIn = await findCheckInById(userId);
  const lastDateKey = checkIn?.dateKey || (checkIn?.user?.createdAt ? getTodayDateKey(checkIn.user.createdAt) : null);
  const missedDateKeys = getMissedDateKeys(lastDateKey, dateKey, {
    includeLastDate: !checkIn?.dateKey,
  });

  await addMissedCheckInDates({ userId, dateKeys: missedDateKeys });
}

export async function getCheckInStatus(userId) {
  await markMissedDaysAsNo(userId);

  const dateKey = getTodayDateKey();
  const nextResetAt = getNextResetAt().toISOString();
  const [checkIn, weekDays] = await Promise.all([
    findCheckInById(userId),
    getWeeklyCheckInDays(userId),
  ]);

  if (!checkIn || checkIn.dateKey !== dateKey || !checkIn.answer) {
    return {
      canAnswer: true,
      answeredToday: false,
      answer: null,
      dateKey,
      nextResetAt,
      weekDays,
    };
  }

  return {
    canAnswer: false,
    answeredToday: true,
    answer: checkIn.answer,
    dateKey,
    nextResetAt,
    weekDays,
  };
}

export async function createDailyCheckIn(userId, answer) {
  await markMissedDaysAsNo(userId);

  const dateKey = getTodayDateKey();
  const checkIn = await createCheckInAndUpdateLeaderboard({ userId, dateKey, answer });

  if (!checkIn) {
    throw new AppError("Already answered today", 409);
  }
}

export async function answerMissedDay(userId, { dateKey, answer }) {
  await markMissedDaysAsNo(userId);

  if (!dateKey || !["YES", "NO"].includes(answer)) {
    throw new AppError("Choose a missed day answer", 400);
  }

  const missedDays = await findMissedDaysByUserId(userId);
  if (!missedDays?.dates?.includes(dateKey)) {
    throw new AppError("Missed day not found", 404);
  }

  await resolveMissedCheckIn({ userId, dateKey, answer });
}
