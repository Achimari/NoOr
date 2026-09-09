import { prisma } from "../prisma/client.js";

const readingCheckInSelect = {
  dateKey: true,
  answer: true,
  reflection: true,
  passages: {
    orderBy: {
      position: "asc",
    },
    select: {
      bookCode: true,
      chapter: true,
      startVerse: true,
      endVerse: true,
      position: true,
    },
  },
};

export async function findReadingCheckIn({ userId, dateKey }, client = prisma) {
  return client.readingCheckIn.findUnique({
    where: {
      userId_dateKey: {
        userId,
        dateKey,
      },
    },
    select: readingCheckInSelect,
  });
}

export async function createReadingCheckIn({ userId, dateKey, answer, reflection, passages }, client = prisma) {
  try {
    return await createReadingCheckInRow({ userId, dateKey, answer, reflection, passages }, client);
  } catch (error) {
    return error?.code === "P2002" ? null : Promise.reject(error);
  }
}

function createReadingCheckInRow({ userId, dateKey, answer, reflection, passages }, client = prisma) {
  return client.$transaction(async (tx) => {
    const existing = await tx.readingCheckIn.findUnique({
      where: {
        userId_dateKey: {
          userId,
          dateKey,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return null;
    }

    return tx.readingCheckIn.create({
      data: {
        userId,
        dateKey,
        answer,
        reflection,
        passages: {
          create: passages,
        },
      },
      select: readingCheckInSelect,
    });
  });
}

export async function upsertReadingCheckIn({ userId, dateKey, answer, reflection, passages }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.readingCheckIn.findUnique({
      where: {
        userId_dateKey: {
          userId,
          dateKey,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return tx.readingCheckIn.create({
        data: {
          userId,
          dateKey,
          answer,
          reflection,
          passages: {
            create: passages,
          },
        },
        select: readingCheckInSelect,
      });
    }

    await tx.readingPassage.deleteMany({
      where: {
        readingCheckInId: existing.id,
      },
    });

    return tx.readingCheckIn.update({
      where: {
        id: existing.id,
      },
      data: {
        answer,
        reflection,
        passages: {
          create: passages,
        },
      },
      select: readingCheckInSelect,
    });
  });
}
