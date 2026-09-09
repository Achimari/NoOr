import { prisma } from "../prisma/client.js";

const streakHistorySelect = {
  id: true,
  name: true,
  timezone: true,
  createdAt: true,
  checkInHistory: {
    select: { dateKey: true, answer: true },
    orderBy: { dateKey: "desc" },
  },
  readingCheckIns: {
    select: { dateKey: true, answer: true },
    orderBy: { dateKey: "desc" },
  },
  dailyGoals: {
    select: { dateKey: true, completedAt: true },
  },
  dailyGoalCheckIns: {
    select: { dateKey: true, answer: true },
    orderBy: { dateKey: "desc" },
  },
  missedDays: {
    select: { dates: true },
  },
};

export async function findProfileSource(userId) {
  return prisma.auth.findUnique({
    where: { id: userId },
    select: streakHistorySelect,
  });
}

export async function findSharedTodayGoals({ userId, dateKey, includeText }) {
  return prisma.dailyGoal.findMany({
    where: { userId, dateKey },
    orderBy: { position: "asc" },
    select: {
      position: true,
      completedAt: true,
      text: includeText,
    },
  });
}

export async function findSharedTodayReading({ userId, dateKey, includeContent }) {
  return prisma.readingCheckIn.findFirst({
    where: { userId, dateKey },
    select: {
      answer: true,
      reflection: includeContent,
      passages: includeContent
        ? {
            select: { bookCode: true, chapter: true, startVerse: true, endVerse: true, position: true },
            orderBy: { position: "asc" },
          }
        : false,
    },
  });
}

export async function findAuthTimezone(userId) {
  return prisma.auth.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
}

export async function findAuthName(userId) {
  return prisma.auth.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
}
