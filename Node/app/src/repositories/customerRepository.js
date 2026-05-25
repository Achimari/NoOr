import { prisma } from "../prisma/client.js";

export async function findCustomerDetailsById(id) {
  return prisma.auth.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isTelegramLinked: true,
      createdAt: true,
      updatedAt: true,
      leaderboard: {
        select: {
          value: true,
        },
      },
      checkIn: {
        select: {
          dateKey: true,
          answer: true,
        },
      },
      prayers: {
        orderBy: {
          id: "desc",
        },
        select: {
          id: true,
          prayer: true,
        },
      },
      telegramConnection: {
        select: {
          telegramUsername: true,
          telegramFirstName: true,
          isActive: true,
          connectedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}
