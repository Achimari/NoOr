import { prisma } from "../prisma/client.js";

export async function findCheckInById(id) {
  return prisma.checkIn.findUnique({
    where: { id },
  });
}

export async function createCheckInAndUpdateLeaderboard({ userId, dateKey, answer }) {
  return prisma.$transaction(async (tx) => {
    const checkIn = await tx.checkIn.updateMany({
      where: {
        id: userId,
        OR: [
          { dateKey: null },
          {
            NOT: {
              dateKey,
            },
          },
        ],
      },
      data: {
        dateKey,
        answer,
      },
    });

    if (checkIn.count === 0) {
      return null;
    }

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
