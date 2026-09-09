import { normalizeStoredPassage } from "../data/bible.js";
import {
  calculateCurrentStreak,
  calculateInactiveDays,
  calculateMaxStreak,
} from "../repositories/checkInRepository.js";
import {
  calculateGoalCurrentStreak,
  calculateGoalMaxStreak,
  calculateReadingCurrentStreak,
  calculateReadingMaxStreak,
  getSuccessfulGoalDateKeys,
  normalizeReadingRows,
} from "./streakLeaderboardService.js";
import {
  findAuthName,
  findProfileSource,
  findSharedTodayGoals,
  findSharedTodayReading,
} from "../repositories/profileRepository.js";
import { getCharacter } from "./progressionService.js";
import { describeCatalog } from "../domain/spells.js";
import {
  DEFAULT_ACCENT_KEY,
  DEFAULT_EMBLEM_KEY,
  EQUIPPED_SPELL_LIMIT,
  PRESET_ACCENTS,
  PRESET_EMBLEMS,
} from "../domain/constants.js";
import { AppError } from "../utils/appError.js";
import { getTodayDateKey } from "../utils/dateKey.js";

function isValidEmblem(key) {
  return PRESET_EMBLEMS.some((emblem) => emblem.key === key);
}

function isValidAccent(key) {
  return PRESET_ACCENTS.some((accent) => accent.key === key);
}

export function sanitizePresentation({ emblemKey, accentKey }) {
  return {
    emblemKey: isValidEmblem(emblemKey) ? emblemKey : DEFAULT_EMBLEM_KEY,
    accentKey: isValidAccent(accentKey) ? accentKey : DEFAULT_ACCENT_KEY,
  };
}

function buildDays(rows, todayDateKey, isSuccess) {
  return [...rows]
    .sort((first, second) => second.dateKey.localeCompare(first.dateKey))
    .map((row) => ({
      dateKey: row.dateKey,
      answer: row.answer === "YES" ? "YES" : "NO",
      success: isSuccess(row),
      isToday: row.dateKey === todayDateKey,
    }));
}

function buildGoalHistoryRows(goalRows, checkInRows) {
  const successfulDateKeys = getSuccessfulGoalDateKeys(goalRows);
  const answerByDateKey = new Map();

  for (const row of goalRows) {
    if (!row?.dateKey) continue;
    answerByDateKey.set(row.dateKey, successfulDateKeys.has(row.dateKey) ? "YES" : "NO");
  }

  for (const row of checkInRows) {
    if (!row?.dateKey || !["YES", "NO"].includes(row.answer)) continue;
    answerByDateKey.set(row.dateKey, row.answer);
  }

  return [...answerByDateKey.entries()].map(([dateKey, answer]) => ({ dateKey, answer }));
}

export function buildStreaks(source, todayDateKey, createdDateKey) {
  const recoveryRows = source.checkInHistory || [];
  const readingRows = source.readingCheckIns || [];
  const goalRows = source.dailyGoals || [];
  const goalCheckInRows = source.dailyGoalCheckIns || [];

  const readingNormalized = [...normalizeReadingRows(readingRows)].reverse();
  const successfulGoalDays = getSuccessfulGoalDateKeys(goalRows);
  const goalHistoryRows = buildGoalHistoryRows(goalRows, goalCheckInRows);

  return addInactiveState({
    recovery: {
      id: "recovery",
      label: "Strong streak",
      description: "Days you answered that you stayed strong.",
      current: calculateCurrentStreak(recoveryRows, todayDateKey),
      best: calculateMaxStreak(recoveryRows),
      qualifyingDays: recoveryRows.filter((row) => row.answer === "YES").length,
      recordedDays: recoveryRows.length,
      inactiveDays: calculateInactiveDays(recoveryRows, todayDateKey, createdDateKey),
      days: buildDays(recoveryRows, todayDateKey, (row) => row.answer === "YES"),
    },
    reading: {
      id: "reading",
      label: "Bible streak",
      description: "Days you answered yes to the Bible reading check.",
      current: calculateReadingCurrentStreak(readingRows, todayDateKey),
      best: calculateReadingMaxStreak(readingRows),
      qualifyingDays: readingNormalized.filter((row) => row.answer === "YES").length,
      recordedDays: readingNormalized.length,
      inactiveDays: calculateInactiveDays(readingNormalized, todayDateKey, createdDateKey),
      days: buildDays(readingNormalized, todayDateKey, (row) => row.answer === "YES"),
    },
    goals: {
      id: "goals",
      label: "Tasks streak",
      description: "Days you finished every task you planned. Dexterity needs all five.",
      current: calculateGoalCurrentStreak(goalRows, todayDateKey),
      best: calculateGoalMaxStreak(goalRows),
      qualifyingDays: successfulGoalDays.size,
      recordedDays: goalHistoryRows.length,
      inactiveDays: calculateInactiveDays(goalHistoryRows, todayDateKey, createdDateKey),
      days: buildDays(goalHistoryRows, todayDateKey, (row) => successfulGoalDays.has(row.dateKey)),
    },
  });
}

function addInactiveState(streaks) {
  return Object.fromEntries(
    Object.entries(streaks).map(([key, streak]) => [
      key,
      { ...streak, isInactive: streak.inactiveDays > 0 },
    ]),
  );
}

function buildIdentity(source, profile) {
  const presentation = sanitizePresentation(profile);

  return {
    id: source.id,
    name: source.name,
    emblemKey: presentation.emblemKey,
    accentKey: presentation.accentKey,
  };
}

export async function getPublicProfile(viewerId, targetId) {
  const id = Number(targetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Profile not found", 404);
  }

  const source = await findProfileSource(id);
  if (!source) {
    throw new AppError("Profile not found", 404);
  }

  const character = await getCharacter(id, { timezone: source.timezone });
  const todayDateKey = getTodayDateKey(new Date(), source.timezone);
  const createdDateKey = getTodayDateKey(source.createdAt, source.timezone);

  return {
    isOwner: Number(viewerId) === id,
    ...buildIdentity(source, character.profile),
    stats: character.totals,
    derived: character.derived,
    spells: { unlockedCount: character.spellKeys.length },
    streaks: buildStreaks(source, todayDateKey, createdDateKey),
    sharing: {
      todayGoals: character.profile.shareTodayGoals,
      todayBibleReflection: character.profile.shareTodayBibleReflection,
    },
  };
}

export async function getOwnProfile(userId) {
  const source = await findProfileSource(userId);
  const [publicProfile, character] = await Promise.all([
    getPublicProfile(userId, userId),
    getCharacter(userId, { timezone: source?.timezone }),
  ]);

  return {
    ...publicProfile,
    isOwner: true,
    base: character.base,
    earned: character.earned,
    allocation: character.allocation,
    rating: character.rating,
    spells: {
      unlockedCount: character.spellKeys.length,
      equipped: character.equippedSpellKeys,
      limit: EQUIPPED_SPELL_LIMIT,
      catalog: describeCatalog({
        wisdom: character.totals.wisdom,
        unlockedKeys: character.spellKeys,
        equippedKeys: character.equippedSpellKeys,
      }),
    },
    presets: { emblems: PRESET_EMBLEMS, accents: PRESET_ACCENTS },
    month: character.month,
    todayDateKey: getTodayDateKey(new Date(), source.timezone),
  };
}

export async function getTodayActivity(viewerId, targetId) {
  const id = Number(targetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Profile not found", 404);
  }

  const source = await findProfileSource(id);
  if (!source) {
    throw new AppError("Profile not found", 404);
  }

  const character = await getCharacter(id, { timezone: source.timezone });
  const isOwner = Number(viewerId) === id;
  const dateKey = getTodayDateKey(new Date(), source.timezone);
  const shareGoals = isOwner || character.profile.shareTodayGoals;
  const shareReading = isOwner || character.profile.shareTodayBibleReflection;

  const tasks = shareGoals
    ? await buildSharedTasks({ userId: id, dateKey })
    : { shared: false };
  const reflection = shareReading
    ? await buildSharedReflection({ userId: id, dateKey })
    : { shared: false };

  return { id, dateKey, tasks, reflection };
}

async function buildSharedTasks({ userId, dateKey }) {
  const goals = await findSharedTodayGoals({ userId, dateKey, includeText: true });
  const completedCount = goals.filter((goal) => goal.completedAt).length;

  return {
    shared: true,
    hasTasks: goals.length > 0,
    total: goals.length,
    completedCount,
    completionPercent: goals.length ? Math.round((completedCount / goals.length) * 100) : 0,
    items: goals.map((goal) => ({
      position: goal.position,
      text: goal.text,
      completed: Boolean(goal.completedAt),
    })),
  };
}

async function buildSharedReflection({ userId, dateKey }) {
  const reading = await findSharedTodayReading({ userId, dateKey, includeContent: true });

  if (!reading) {
    return { shared: true, hasEntry: false, answer: null, passages: [], reflection: null };
  }

  return {
    shared: true,
    hasEntry: true,
    answer: reading.answer,
    passages: (reading.passages || []).map(normalizeStoredPassage),
    reflection: reading.reflection?.trim() ? reading.reflection : null,
  };
}
