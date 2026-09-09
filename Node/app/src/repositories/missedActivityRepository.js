import { prisma } from "../prisma/client.js";

export async function findAccountCreatedAt(userId, client = prisma) {
  const account = await client.auth.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  return account?.createdAt || null;
}

export async function findMissedActivitySources(userId, client = prisma) {
  const [createdAt, recovery, reading, goals, goalCheckIns] = await Promise.all([
    findAccountCreatedAt(userId, client),
    client.checkInHistory.findMany({
      where: { userId },
      select: { dateKey: true },
    }),
    client.readingCheckIn.findMany({
      where: { userId },
      select: { dateKey: true },
    }),
    client.dailyGoal.findMany({
      where: { userId },
      select: { dateKey: true },
    }),
    client.dailyGoalCheckIn.findMany({
      where: { userId },
      select: { dateKey: true },
    }),
  ]);

  return { createdAt, recovery, reading, goals: [...goals, ...goalCheckIns] };
}
