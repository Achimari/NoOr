import { prisma } from "../prisma/client.js";

export async function incrementLeaderboardValue(id) {
  return prisma.leaderboard.upsert({
    where: { id },
    create: {
      id,
      value: 1,
    },
    update: {
      value: {
        increment: 1,
      },
    },
  });
}

export async function resetLeaderboardValue(id) {
  return prisma.leaderboard.upsert({
    where: { id },
    create: {
      id,
      value: 0,
    },
    update: {
      value: 0,
    },
  });
}

export async function findLeaderboardValueById(id) {
  return prisma.leaderboard.findUnique({
    where: { id },
  });
}

export async function findTopLeaderboardRows(limit = 10) {
  return prisma.leaderboard.findMany({
    orderBy: [{ value: "desc" }, { id: "asc" }],
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}
