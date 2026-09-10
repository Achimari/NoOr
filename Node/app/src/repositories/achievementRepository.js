import { withoutNoData } from "../domain/activityAnswers.js";
import { prisma } from "../prisma/client.js";

const readingSelect = {
  dateKey: true,
  answer: true,
  reflection: true,
  passages: { select: { bookCode: true } },
};

function toReadingFact(row) {
  return {
    dateKey: row.dateKey,
    answer: row.answer,
    hasReflection: String(row.reflection || "").trim().length > 0,
    bookCodes: (row.passages || []).map((passage) => passage.bookCode),
  };
}

export async function findAchievementSources(userId, client = prisma) {
  const [
    gameProfile,
    strongRows,
    readingRows,
    goalRows,
    goalCheckInRows,
    spellRows,
    pveRows,
    qualifyingPvpMatches,
  ] = await Promise.all([
    client.gameProfile.findUnique({
      where: { id: userId },
      select: { allocationConfirmedAt: true, accentKey: true },
    }),
    client.checkInHistory.findMany({
      where: { userId },
      select: { dateKey: true, answer: true },
    }),
    client.readingCheckIn.findMany({
      where: { userId },
      select: readingSelect,
    }),
    client.dailyGoal.findMany({
      where: { userId },
      select: { dateKey: true, completedAt: true },
    }),
    client.dailyGoalCheckIn.findMany({
      where: { userId },
      select: { dateKey: true, answer: true },
    }),
    client.spellUnlock.findMany({
      where: { userId },
      select: { spellKey: true },
    }),
    client.pveProgress.findMany({
      where: { userId, status: "COMPLETED" },
      select: { encounterKey: true },
    }),
    client.battleParticipant.count({
      where: {
        userId,
        battle: {
          mode: "PVP",
          status: "COMPLETED",
          actions: { none: { actionType: "FORFEIT" } },
        },
      },
    }),
  ]);

  return {
    gameProfile,
    strongRows,
    readingRows: readingRows.map(toReadingFact),
    goalRows,
    goalCheckInDateKeys: withoutNoData(goalCheckInRows).map((row) => row.dateKey),
    spellKeys: spellRows.map((row) => row.spellKey),
    completedEncounterKeys: pveRows.map((row) => row.encounterKey),
    qualifyingPvpMatches,
  };
}

export async function findAchievementUnlocks(userId, client = prisma) {
  return client.achievementUnlock.findMany({
    where: { userId },
    select: { achievementKey: true, unlockedAt: true },
    orderBy: { unlockedAt: "asc" },
  });
}

export async function createAchievementUnlocks({ userId, achievementKeys }, client = prisma) {
  if (!achievementKeys?.length) return 0;

  const result = await client.achievementUnlock.createMany({
    data: achievementKeys.map((achievementKey) => ({ userId, achievementKey })),
    skipDuplicates: true,
  });

  return result.count;
}
