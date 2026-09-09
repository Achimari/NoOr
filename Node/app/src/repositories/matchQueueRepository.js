import { prisma } from "../prisma/client.js";

const queueSelect = {
  id: true,
  userId: true,
  status: true,
  rating: true,
  battleId: true,
  createdAt: true,
  expiresAt: true,
};

export async function findActiveQueueEntry(userId) {
  return prisma.matchQueueEntry.findUnique({
    where: { activeQueueUserId: userId },
    select: queueSelect,
  });
}

export async function findQueueEntryById(id) {
  return prisma.matchQueueEntry.findUnique({ where: { id }, select: queueSelect });
}

export async function createQueueEntry({ userId, rating, expiresAt }) {
  try {
    return await prisma.matchQueueEntry.create({
      data: { userId, activeQueueUserId: userId, rating, expiresAt, status: "SEARCHING" },
      select: queueSelect,
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;

    return findActiveQueueEntry(userId);
  }
}

export async function cancelQueueEntry(userId) {
  const result = await prisma.matchQueueEntry.updateMany({
    where: { activeQueueUserId: userId, status: "SEARCHING" },
    data: { status: "CANCELLED", activeQueueUserId: null },
  });

  return result.count === 1;
}

export async function expireStaleEntries(now = new Date()) {
  const result = await prisma.matchQueueEntry.updateMany({
    where: { status: "SEARCHING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", activeQueueUserId: null },
  });

  return result.count;
}

export async function findCandidates({ userId, minRating, maxRating, now = new Date() }) {
  return prisma.matchQueueEntry.findMany({
    where: {
      status: "SEARCHING",
      userId: { not: userId },
      rating: { gte: minRating, lte: maxRating },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "asc" },
    select: queueSelect,
    take: 10,
  });
}

export async function claimPair({ selfUserId, opponentUserId }) {
  return prisma.$transaction(async (tx) => {
    const self = await tx.matchQueueEntry.updateMany({
      where: { activeQueueUserId: selfUserId, status: "SEARCHING" },
      data: { status: "MATCHED", activeQueueUserId: null },
    });

    if (self.count !== 1) return { claimed: false };

    const opponent = await tx.matchQueueEntry.updateMany({
      where: { activeQueueUserId: opponentUserId, status: "SEARCHING" },
      data: { status: "MATCHED", activeQueueUserId: null },
    });

    if (opponent.count !== 1) {
      await tx.matchQueueEntry.updateMany({
        where: { userId: selfUserId, status: "MATCHED", battleId: null },
        data: { status: "SEARCHING", activeQueueUserId: selfUserId },
      });

      return { claimed: false };
    }

    return { claimed: true };
  });
}

export async function attachBattleToEntries({ userIds, battleId }) {
  return prisma.matchQueueEntry.updateMany({
    where: { userId: { in: userIds }, status: "MATCHED", battleId: null },
    data: { battleId },
  });
}
