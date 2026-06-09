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

export async function findCheckInHistoryByUserId(userId) {
  return prisma.checkInHistory.findMany({
    where: { userId },
    select: {
      dateKey: true,
      answer: true,
    },
  });
}

export async function findAllCheckInHistory() {
  return prisma.checkInHistory.findMany({
    select: {
      dateKey: true,
      answer: true,
    },
  });
}

export async function findUsersWithCheckInHistory() {
  return prisma.auth.findMany({
    select: {
      id: true,
      name: true,
      checkInHistory: {
        select: {
          dateKey: true,
          answer: true,
        },
      },
    },
  });
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function previousDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return formatDateKey(date);
}

function nextDateKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return formatDateKey(date);
}

export function calculateCurrentStreak(historyRows) {
  const rows = [...historyRows].sort((first, second) => second.dateKey.localeCompare(first.dateKey));
  if (!rows.length || rows[0].answer !== "YES") return 0;

  let expectedDateKey = rows[0].dateKey;
  let streak = 0;

  for (const row of rows) {
    if (row.dateKey !== expectedDateKey || row.answer !== "YES") break;
    streak += 1;
    expectedDateKey = previousDateKey(expectedDateKey);
    if (!expectedDateKey) break;
  }

  return streak;
}

export function calculateMaxStreak(historyRows) {
  const rows = [...historyRows].sort((first, second) => first.dateKey.localeCompare(second.dateKey));
  let streak = 0;
  let maxStreak = 0;
  let previousYesDateKey = null;

  for (const row of rows) {
    if (row.answer !== "YES") {
      streak = 0;
      previousYesDateKey = null;
      continue;
    }

    streak = previousYesDateKey && nextDateKey(previousYesDateKey) === row.dateKey ? streak + 1 : 1;
    maxStreak = Math.max(maxStreak, streak);
    previousYesDateKey = row.dateKey;
  }

  return maxStreak;
}

async function updateCurrentCheckIn(tx, { userId, dateKey, answer }) {
  const currentCheckIn = await tx.checkIn.findUnique({
    where: { id: userId },
  });
  const shouldUpdateCurrent = !currentCheckIn?.dateKey || currentCheckIn.dateKey <= dateKey;

  if (currentCheckIn && !shouldUpdateCurrent) {
    return currentCheckIn;
  }

  return tx.checkIn.upsert({
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
}

export async function createCheckIn({ userId, dateKey, answer }) {
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

    await updateCurrentCheckIn(tx, { userId, dateKey, answer });

    return tx.checkIn.findUnique({
      where: { id: userId },
    });
  });
}

export async function addMissedCheckInDates({ userId, dateKeys }) {
  if (!dateKeys.length) return 0;

  return prisma.$transaction(async (tx) => {
    const [answeredRows, currentMissed] = await Promise.all([
      tx.checkInHistory.findMany({
        where: {
          userId,
          dateKey: {
            in: dateKeys,
          },
        },
        select: {
          dateKey: true,
        },
      }),
      tx.missedDays.findUnique({
        where: { id: userId },
      }),
    ]);

    const answeredDateKeys = new Set(answeredRows.map((row) => row.dateKey));
    const currentDates = currentMissed?.dates || [];
    const currentDateKeys = new Set(currentDates);
    const newDateKeys = dateKeys.filter((dateKey) => !answeredDateKeys.has(dateKey) && !currentDateKeys.has(dateKey));

    if (!newDateKeys.length) {
      return 0;
    }

    const dates = [...currentDates, ...newDateKeys].sort();

    await tx.missedDays.upsert({
      where: { id: userId },
      create: {
        id: userId,
        count: dates.length,
        dates,
      },
      update: {
        count: dates.length,
        dates,
      },
    });

    return newDateKeys.length;
  });
}

export async function findMissedDaysByUserId(userId) {
  return prisma.missedDays.findUnique({
    where: { id: userId },
  });
}

export async function findMissedDaysByUserIds(userIds) {
  if (!userIds.length) return [];

  return prisma.missedDays.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });
}

export async function resolveMissedCheckIn({ userId, dateKey, answer }) {
  return prisma.$transaction(async (tx) => {
    const missed = await tx.missedDays.findUnique({
      where: { id: userId },
    });

    if (!missed?.dates?.includes(dateKey)) {
      return null;
    }

    await tx.checkInHistory.createMany({
      data: [{
        userId,
        dateKey,
        answer,
      }],
      skipDuplicates: true,
    });
    await updateCurrentCheckIn(tx, { userId, dateKey, answer });

    const dates = missed.dates.filter((missedDateKey) => missedDateKey !== dateKey).sort();

    await tx.missedDays.update({
      where: { id: userId },
      data: {
        count: dates.length,
        dates,
      },
    });

    return tx.checkIn.findUnique({
      where: { id: userId },
    });
  });
}
