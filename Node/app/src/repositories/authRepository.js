import { prisma } from "../prisma/client.js";

export async function createAuthUser({ name, passwordHash }) {
  return prisma.auth.create({
    data: {
      name,
      passwordHash,
      leaderboard: {
        create: {
          value: 0,
        },
      },
      checkIn: {
        create: {},
      },
    },
  });
}

export async function findAuthUserByName(name) {
  return prisma.auth.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
  });
}

export async function findAuthUserById(id) {
  return prisma.auth.findUnique({
    where: { id },
  });
}

export async function updateAuthUserTimezone({ id, timezone }) {
  return prisma.auth.update({
    where: { id },
    data: { timezone },
  });
}

export async function createSession({ userId, sessionTokenHash, expiresAt }) {
  return prisma.session.create({
    data: {
      userId,
      sessionTokenHash,
      expiresAt,
    },
  });
}

export async function findActiveSessionByHash(sessionTokenHash) {
  return prisma.session.findFirst({
    where: {
      sessionTokenHash,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
}

export async function deleteSessionByHash(sessionTokenHash) {
  return prisma.session.deleteMany({
    where: {
      sessionTokenHash,
    },
  });
}

export async function deleteExpiredSessions() {
  return prisma.session.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(),
      },
    },
  });
}
