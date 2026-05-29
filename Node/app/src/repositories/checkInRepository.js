import { prisma } from "../prisma/client.js";

export async function findCheckInById(id) {
  return prisma.checkIn.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          createdAt: true,
        },
      },
    },
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

export async function markMissedCheckInsAsNo({ userId, dateKeys }) {
  if (!dateKeys.length) return 0;

  return prisma.$transaction(async (tx) => {
    const history = await tx.checkInHistory.createMany({
      data: dateKeys.map((dateKey) => ({
        userId,
        dateKey,
        answer: "NO",
      })),
      skipDuplicates: true,
    });

    if (history.count === 0) {
      return 0;
    }

    const latestMissedDateKey = dateKeys.at(-1);

    await tx.checkIn.upsert({
      where: {
        id: userId,
      },
      create: {
        id: userId,
        dateKey: latestMissedDateKey,
        answer: "NO",
      },
      update: {
        dateKey: latestMissedDateKey,
        answer: "NO",
      },
    });

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

    return history.count;
  });
}
