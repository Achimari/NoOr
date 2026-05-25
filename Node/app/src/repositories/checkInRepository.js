import { prisma } from "../prisma/client.js";

export async function findCheckInById(id) {
  return prisma.checkIn.findUnique({
    where: { id },
  });
}

export async function findCheckInHistoryByDateKeys(userId, dateKeys) {
  return prisma.checkInHistory.findMany({
    where: {
      userId,
      dateKey: {
        in: dateKeys,
      },
    },
    select: {
      dateKey: true,
      answer: true,
    },
  });
}

export async function createCheckInAndUpdateLeaderboard({ userId, dateKey, answer }) {
  return prisma.$transaction(async (tx) => {
    const history = await tx.checkInHistory.createMany({
      data: [{
        userId,
        dateKey,
        answer,
      }],
      skipDuplicates: true,
    });

    if (history.count === 0) {
      return null;
    }

    await tx.checkIn.upsert({
      where: {
        id: userId,
      },
      create: {
        id: userId,
        dateKey,
        answer,
      },
      update: {
        dateKey,
        answer,
      },
    });

    if (answer === "YES") {
      await tx.leaderboard.upsert({
        where: { id: userId },
        create: {
          id: userId,
          value: 1,
        },
        update: {
          value: {
            increment: 1,
          },
        },
      });
    } else {
      await tx.leaderboard.upsert({
        where: { id: userId },
        create: {
          id: userId,
          value: 0,
        },
        update: {
          value: 0,
        },
      });
    }

    return tx.checkIn.findUnique({
      where: { id: userId },
    });
  });
}
