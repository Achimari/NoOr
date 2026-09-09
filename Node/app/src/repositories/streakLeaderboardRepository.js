import { prisma } from "../prisma/client.js";

export async function findReadingStreakRows() {
  return prisma.auth.findMany({
    select: {
      id: true,
      name: true,
      timezone: true,
      createdAt: true,
      readingCheckIns: {
        select: {
          dateKey: true,
          answer: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });
}

export async function findGoalStreakRows() {
  return prisma.auth.findMany({
    select: {
      id: true,
      name: true,
      timezone: true,
      createdAt: true,
      dailyGoals: {
        select: {
          dateKey: true,
          completedAt: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });
}
