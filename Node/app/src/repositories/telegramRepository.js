import { prisma } from "../prisma/client.js";

export async function createTelegramConnectToken({ userId, tokenHash, expiresAt }) {
  return prisma.telegramConnectToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });
}

export async function findTelegramConnectToken(tokenHash) {
  return prisma.telegramConnectToken.findUnique({
    where: { tokenHash },
  });
}

export async function markTelegramConnectTokenUsed(id) {
  return prisma.telegramConnectToken.updateMany({
    where: {
      id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });
}

export async function findTelegramConnectionByUserId(userId) {
  return prisma.telegramConnection.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          timezone: true,
        },
      },
    },
  });
}

export async function findTelegramConnectionByChatId(telegramChatId) {
  return prisma.telegramConnection.findUnique({
    where: { telegramChatId },
    include: {
      user: {
        select: {
          timezone: true,
        },
      },
    },
  });
}

export async function findActiveTelegramConnections() {
  return prisma.telegramConnection.findMany({
    where: {
      isActive: true,
    },
    include: {
      user: {
        select: {
          timezone: true,
          checkIn: {
            select: {
              dateKey: true,
              answer: true,
            },
          },
        },
      },
    },
  });
}

export async function claimTelegramNotification({ userId, notificationType, dateKey }) {
  try {
    await prisma.telegramNotificationLog.create({
      data: {
        userId,
        notificationType,
        dateKey,
      },
    });

    return true;
  } catch (error) {
    if (error?.code === "P2002") {
      return false;
    }

    throw error;
  }
}

export async function upsertTelegramConnection({
  userId,
  telegramChatId,
  telegramUsername,
  telegramFirstName,
}) {
  return prisma.$transaction(async (tx) => {
    const connection = await tx.telegramConnection.upsert({
      where: { userId },
      create: {
        userId,
        telegramChatId,
        telegramUsername,
        telegramFirstName,
        isActive: true,
      },
      update: {
        telegramChatId,
        telegramUsername,
        telegramFirstName,
        isActive: true,
        connectedAt: new Date(),
      },
    });

    await tx.auth.update({
      where: { id: userId },
      data: {
        isTelegramLinked: true,
      },
    });

    return connection;
  });
}
