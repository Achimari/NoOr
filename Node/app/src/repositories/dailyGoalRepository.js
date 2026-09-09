import { prisma } from "../prisma/client.js";
import { AppError } from "../utils/appError.js";

export const DAILY_GOAL_LIMIT = 5;

const dailyGoalSelect = {
  id: true,
  dateKey: true,
  text: true,
  position: true,
  completedAt: true,
};

const goalPositions = Array.from({ length: DAILY_GOAL_LIMIT }, (unused, index) => index + 1);

export async function findDailyGoals({ userId, dateKey }) {
  return prisma.dailyGoal.findMany({
    where: { userId, dateKey },
    orderBy: { position: "asc" },
    select: dailyGoalSelect,
  });
}

export async function findDailyGoalForOwner({ id, userId }) {
  return prisma.dailyGoal.findFirst({
    where: { id, userId },
    select: dailyGoalSelect,
  });
}

async function findFreePosition({ userId, dateKey }) {
  const taken = await prisma.dailyGoal.findMany({
    where: { userId, dateKey },
    select: { position: true },
  });
  const usedPositions = new Set(taken.map((goal) => goal.position));

  return goalPositions.find((position) => !usedPositions.has(position)) || null;
}

export async function createDailyGoal({ userId, dateKey, text }) {
  for (let attempt = 0; attempt < DAILY_GOAL_LIMIT; attempt += 1) {
    const position = await findFreePosition({ userId, dateKey });
    if (!position) return null;

    try {
      return await prisma.dailyGoal.create({
        data: { userId, dateKey, text, position },
        select: dailyGoalSelect,
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }

  return null;
}

export async function createHistoricalDailyGoals({ userId, dateKey, answer, tasks, completedAt }, client = prisma) {
  const rows = tasks || [];
  const recordedAnswer = answer || (rows.length ? "YES" : null);
  if (!recordedAnswer) return null;
  if (!["YES", "NO"].includes(recordedAnswer)) {
    throw new AppError("Choose Yes or No for that task day", 400);
  }
  if (rows.length > DAILY_GOAL_LIMIT) {
    throw new AppError(`You can record up to five tasks a day`, 400);
  }
  if (recordedAnswer === "YES" && !rows.length) {
    throw new AppError("Add at least one task you completed", 400);
  }
  if (recordedAnswer === "NO" && rows.length) {
    throw new AppError("A No answer cannot include completed tasks", 400);
  }

  try {
    return await client.$transaction(async (tx) => {
      const [existingCheckIn, existingGoals] = await Promise.all([
        tx.dailyGoalCheckIn.findUnique({
          where: { userId_dateKey: { userId, dateKey } },
          select: { id: true },
        }),
        tx.dailyGoal.findMany({
          where: { userId, dateKey },
          select: { id: true },
        }),
      ]);

      if (existingCheckIn || existingGoals.length) return null;

      await tx.dailyGoalCheckIn.create({
        data: { userId, dateKey, answer: recordedAnswer },
        select: { id: true },
      });

      if (recordedAnswer === "NO") return 0;

      const result = await tx.dailyGoal.createMany({
        data: rows.map((text, index) => ({
          userId,
          dateKey,
          text,
          position: index + 1,
          completedAt,
        })),
        skipDuplicates: true,
      });

      return result.count;
    });
  } catch (error) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}

export async function updateDailyGoalText({ id, userId, dateKey, text }) {
  const result = await prisma.dailyGoal.updateMany({
    where: { id, userId, dateKey, completedAt: null },
    data: { text },
  });

  return result.count;
}

export async function updateDailyGoalCompletion({ id, userId, dateKey, completedAt }) {
  const result = await prisma.dailyGoal.updateMany({
    where: { id, userId, dateKey },
    data: { completedAt },
  });

  return result.count;
}

export async function deleteDailyGoal({ id, userId, dateKey }) {
  const result = await prisma.dailyGoal.deleteMany({
    where: { id, userId, dateKey, completedAt: null },
  });

  return result.count;
}
