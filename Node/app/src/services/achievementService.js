import {
  ACHIEVEMENT_TOTAL,
  buildAchievementItems,
  getClosestNext,
  getLatestEarned,
  getMissingUnlockKeys,
  groupByCategory,
  normalizeFacts,
  summarizeAchievements,
} from "../domain/achievements.js";
import {
  createAchievementUnlocks,
  findAchievementSources,
  findAchievementUnlocks,
} from "../repositories/achievementRepository.js";
import { calculateMaxStreak } from "../repositories/checkInRepository.js";
import {
  calculateGoalMaxStreak,
  calculateReadingMaxStreak,
} from "./streakLeaderboardService.js";
import { DEXTERITY_REQUIRED_GOALS, DEFAULT_ACCENT_KEY, PRESET_ACCENTS } from "../domain/constants.js";
import { AppError } from "../utils/appError.js";

const defaultGateway = {
  findAchievementSources,
  findAchievementUnlocks,
  createAchievementUnlocks,
};

function isValidAccent(key) {
  return PRESET_ACCENTS.some((accent) => accent.key === key);
}

function sanitizeAccentKey(accentKey) {
  return isValidAccent(accentKey) ? accentKey : DEFAULT_ACCENT_KEY;
}

function countDistinct(values) {
  return new Set(values).size;
}

function countFullyRecordedDays({ strongRows, readingRows, goalRows, goalCheckInDateKeys }) {
  const readingDates = new Set(readingRows.map((row) => row.dateKey));
  const taskDates = new Set([
    ...goalCheckInDateKeys,
    ...goalRows.map((row) => row.dateKey),
  ]);

  return countDistinct(
    strongRows
      .map((row) => row.dateKey)
      .filter((dateKey) => readingDates.has(dateKey) && taskDates.has(dateKey)),
  );
}

function countFiveTaskDays(goalRows) {
  const byDateKey = new Map();

  for (const row of goalRows) {
    if (!row?.dateKey) continue;
    const day = byDateKey.get(row.dateKey) || { total: 0, completed: 0 };
    day.total += 1;
    if (row.completedAt) day.completed += 1;
    byDateKey.set(row.dateKey, day);
  }

  return [...byDateKey.values()].filter(
    (day) => day.total === DEXTERITY_REQUIRED_GOALS && day.completed === DEXTERITY_REQUIRED_GOALS,
  ).length;
}

export function buildAchievementFacts(sources) {
  const strongRows = sources.strongRows || [];
  const readingRows = sources.readingRows || [];
  const goalRows = sources.goalRows || [];
  const goalCheckInDateKeys = sources.goalCheckInDateKeys || [];
  const readingYesRows = readingRows.filter((row) => row.answer === "YES");

  return normalizeFacts({
    allocationConfirmed: Boolean(sources.gameProfile?.allocationConfirmedAt),
    strongRecordedDays: countDistinct(strongRows.map((row) => row.dateKey)),
    strongBestStreak: calculateMaxStreak(strongRows),
    readingYesDays: countDistinct(readingYesRows.map((row) => row.dateKey)),
    readingBestStreak: calculateReadingMaxStreak(readingRows),
    reflectedReadingDays: countDistinct(
      readingYesRows.filter((row) => row.hasReflection).map((row) => row.dateKey),
    ),
    distinctBibleBooks: countDistinct(readingYesRows.flatMap((row) => row.bookCodes || [])),
    fiveTaskDays: countFiveTaskDays(goalRows),
    taskBestStreak: calculateGoalMaxStreak(goalRows),
    fullyRecordedDays: countFullyRecordedDays({ strongRows, readingRows, goalRows, goalCheckInDateKeys }),
    unlockedSpellKeys: sources.spellKeys || [],
    completedEncounterKeys: sources.completedEncounterKeys || [],
    qualifyingPvpMatches: sources.qualifyingPvpMatches || 0,
  });
}

function assertOwnerId(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Achievements are not available", 404);
  }

  return id;
}

function buildPageView({ facts, unlocks, accentKey }) {
  const items = buildAchievementItems({ facts, unlocks });

  return {
    accentKey,
    total: ACHIEVEMENT_TOTAL,
    summary: summarizeAchievements(items),
    latest: getLatestEarned(items),
    closestNext: getClosestNext(items),
    categories: groupByCategory(items),
  };
}

export async function getAchievementsForUser(userId, gateway = defaultGateway) {
  const ownerId = assertOwnerId(userId);

  const [sources, existingUnlocks] = await Promise.all([
    gateway.findAchievementSources(ownerId),
    gateway.findAchievementUnlocks(ownerId),
  ]);

  const facts = buildAchievementFacts(sources);
  const missingKeys = getMissingUnlockKeys(facts, existingUnlocks.map((row) => row.achievementKey));

  let unlocks = existingUnlocks;
  if (missingKeys.length) {
    await gateway.createAchievementUnlocks({ userId: ownerId, achievementKeys: missingKeys });
    unlocks = await gateway.findAchievementUnlocks(ownerId);
  }

  return buildPageView({
    facts,
    unlocks,
    accentKey: sanitizeAccentKey(sources.gameProfile?.accentKey),
  });
}
