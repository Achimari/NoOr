import { prisma } from "../prisma/client.js";

export async function createPrayer({ userId, prayer }) {
  return prisma.prayer.create({
    data: {
      userId,
      prayer,
    },
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function findPrayers(limit = 20) {
  return prisma.prayer.findMany({
    orderBy: {
      id: "asc",
    },
    take: limit,
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function findPrayersByUserId(userId, limit = 20) {
  return prisma.prayer.findMany({
    where: {
      userId,
    },
    orderBy: {
      id: "asc",
    },
    take: limit,
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function deletePrayerByOwner({ id, userId }) {
  return prisma.prayer.deleteMany({
    where: {
      id,
      userId,
    },
  });
}
