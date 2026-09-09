import { prisma } from "../prisma/client.js";

const rewardSelect = {
  id: true,
  stat: true,
  source: true,
  dateKey: true,
  amount: true,
};

export async function findRewardsInMonth({ userId, startDateKey, endDateKeyExclusive }) {
  return prisma.statReward.findMany({
    where: { userId, dateKey: { gte: startDateKey, lt: endDateKeyExclusive } },
    select: rewardSelect,
    orderBy: { dateKey: "asc" },
  });
}

export async function findRewardsForDate({ userId, dateKey }, client = prisma) {
  return client.statReward.findMany({
    where: { userId, dateKey },
    select: rewardSelect,
  });
}

export async function createRewards({ userId, dateKey, rewards }, client = prisma) {
  if (!rewards.length) return 0;

  const result = await client.statReward.createMany({
    data: rewards.map((reward) => ({
      userId,
      dateKey,
      stat: reward.stat,
      source: reward.source,
      amount: 1,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export async function deleteRewards({ userId, dateKey, rewards }, client = prisma) {
  if (!rewards.length) return 0;

  const result = await client.statReward.deleteMany({
    where: {
      userId,
      dateKey,
      OR: rewards.map((reward) => ({ stat: reward.stat, source: reward.source })),
    },
  });

  return result.count;
}

export async function findSourceDateKeys(userId) {
  const [recovery, reading, goals] = await Promise.all([
    prisma.checkInHistory.findMany({ where: { userId }, select: { dateKey: true } }),
    prisma.readingCheckIn.findMany({ where: { userId }, select: { dateKey: true } }),
    prisma.dailyGoal.findMany({ where: { userId }, select: { dateKey: true } }),
  ]);

  return [...new Set([...recovery, ...reading, ...goals].map((row) => row.dateKey))].sort();
}

export async function findSourceRowsForDate({ userId, dateKey }, client = prisma) {
  const [recovery, reading, goals] = await Promise.all([
    client.checkInHistory.findFirst({
      where: { userId, dateKey },
      select: { answer: true },
    }),
    client.readingCheckIn.findFirst({
      where: { userId, dateKey },
      select: { answer: true, reflection: true },
    }),
    client.dailyGoal.findMany({
      where: { userId, dateKey },
      select: { id: true, completedAt: true },
    }),
  ]);

  return { recovery, reading, goals };
}

