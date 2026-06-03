import { prisma } from "../prisma/client.js";

const prayerInclude = {
  user: {
    select: {
      name: true,
    },
  },
  reactions: {
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
    select: {
      emoji: true,
      userId: true,
    },
  },
};

export async function createPrayer({ userId, prayer }) {
  return prisma.prayer.create({
    data: {
      userId,
      prayer,
    },
    include: prayerInclude,
  });
}

export async function findPrayers(limit = 20) {
  return prisma.prayer.findMany({
    orderBy: {
      id: "desc",
    },
    take: limit,
    include: prayerInclude,
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
    include: prayerInclude,
  });
}

export async function findPrayerById(id) {
  return prisma.prayer.findUnique({
    where: {
      id,
    },
    include: prayerInclude,
  });
}

export async function upsertPrayerReaction({ prayerId, userId, emoji }) {
  return prisma.prayerReaction.upsert({
    where: {
      prayerId_userId: {
        prayerId,
        userId,
      },
    },
    update: {
      emoji,
    },
    create: {
      prayerId,
      userId,
      emoji,
    },
  });
}

export async function deletePrayerReaction({ prayerId, userId }) {
  return prisma.prayerReaction.deleteMany({
    where: {
      prayerId,
      userId,
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
