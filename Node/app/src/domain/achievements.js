
import { SPELL_CATALOG } from "./spells.js";

export const ACHIEVEMENT_STATUS = {
  EARNED: "EARNED",
  IN_PROGRESS: "IN_PROGRESS",
  NOT_STARTED: "NOT_STARTED",
};

export const ACHIEVEMENT_CATEGORIES = [
  {
    key: "foundations",
    name: "Foundations",
    description: "The first time you did each thing.",
  },
  {
    key: "daily-rhythm",
    name: "Daily rhythm",
    description: "Days recorded and runs kept.",
  },
  {
    key: "reflection-learning",
    name: "Reflection and learning",
    description: "Reading, reflecting and learning spells.",
  },
  {
    key: "trials",
    name: "Trials",
    description: "The shipped trials and one friendly battle.",
  },
];

export const V1_TRIAL_KEYS = ["the-doubt", "the-distraction", "the-discouragement"];

const TIER_LABELS = { 1: "Tier I", 2: "Tier II", 3: "Tier III" };

export const EMPTY_FACTS = Object.freeze({
  allocationConfirmed: false,
  strongRecordedDays: 0,
  strongBestStreak: 0,
  readingYesDays: 0,
  readingBestStreak: 0,
  reflectedReadingDays: 0,
  distinctBibleBooks: 0,
  fiveTaskDays: 0,
  taskBestStreak: 0,
  fullyRecordedDays: 0,
  unlockedSpellKeys: [],
  completedEncounterKeys: [],
  qualifyingPvpMatches: 0,
});

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.trunc(count) : 0;
}

function toKeyList(value) {
  return Array.isArray(value) ? value.filter((key) => typeof key === "string" && key.length > 0) : [];
}

export function normalizeFacts(facts = {}) {
  return {
    allocationConfirmed: Boolean(facts.allocationConfirmed),
    strongRecordedDays: toCount(facts.strongRecordedDays),
    strongBestStreak: toCount(facts.strongBestStreak),
    readingYesDays: toCount(facts.readingYesDays),
    readingBestStreak: toCount(facts.readingBestStreak),
    reflectedReadingDays: toCount(facts.reflectedReadingDays),
    distinctBibleBooks: toCount(facts.distinctBibleBooks),
    fiveTaskDays: toCount(facts.fiveTaskDays),
    taskBestStreak: toCount(facts.taskBestStreak),
    fullyRecordedDays: toCount(facts.fullyRecordedDays),
    unlockedSpellKeys: toKeyList(facts.unlockedSpellKeys),
    completedEncounterKeys: toKeyList(facts.completedEncounterKeys),
    qualifyingPvpMatches: toCount(facts.qualifyingPvpMatches),
  };
}

function countFact(name) {
  return (facts) => facts[name];
}

function hasTrial(encounterKey) {
  return (facts) => (facts.completedEncounterKeys.includes(encounterKey) ? 1 : 0);
}

function definition(entry) {
  return {
    tier: null,
    ...entry,
    tierLabel: entry.tier ? TIER_LABELS[entry.tier] : null,
  };
}

const CATALOG = [
  definition({
    key: "first-check-in",
    category: "foundations",
    name: "First Step",
    description: "Record one Strong check-in. Yes and No both count.",
    iconKey: "first-step",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 1,
    unit: "recorded check-ins",
    progress: countFact("strongRecordedDays"),
  }),
  definition({
    key: "first-reading",
    category: "foundations",
    name: "Open the Book",
    description: "Record one Bible reading day answered Yes.",
    iconKey: "open-book",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 1,
    unit: "reading days",
    progress: countFact("readingYesDays"),
  }),
  definition({
    key: "first-reflection",
    category: "foundations",
    name: "Words Considered",
    description: "Write one reflection on a Bible reading day answered Yes.",
    iconKey: "reflection",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 1,
    unit: "reflected days",
    progress: countFact("reflectedReadingDays"),
  }),
  definition({
    key: "five-finished",
    category: "foundations",
    name: "Five Finished",
    description: "Complete all five daily tasks on a single date.",
    iconKey: "five-checks",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 1,
    unit: "days",
    progress: countFact("fiveTaskDays"),
  }),
  definition({
    key: "character-formed",
    category: "foundations",
    name: "Character Formed",
    description: "Confirm your ten base character points.",
    iconKey: "character",
    href: "/profile",
    nextStep: "Open My Profile",
    target: 1,
    unit: "confirmations",
    progress: (facts) => (facts.allocationConfirmed ? 1 : 0),
  }),

  definition({
    key: "full-record-1",
    category: "daily-rhythm",
    tier: 1,
    name: "Day in Full",
    description: "Keep a Strong, Bible and tasks record on the same date, once. Yes and No both count.",
    iconKey: "three-part-day",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 1,
    unit: "fully recorded dates",
    progress: countFact("fullyRecordedDays"),
  }),
  definition({
    key: "full-record-7",
    category: "daily-rhythm",
    tier: 2,
    name: "Seven Days Seen",
    description: "Keep a Strong, Bible and tasks record on the same date, on seven dates in total.",
    iconKey: "three-part-day",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 7,
    unit: "fully recorded dates",
    progress: countFact("fullyRecordedDays"),
  }),
  definition({
    key: "full-record-30",
    category: "daily-rhythm",
    tier: 3,
    name: "Thirty Days Seen",
    description: "Keep a Strong, Bible and tasks record on the same date, on thirty dates in total.",
    iconKey: "three-part-day",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 30,
    unit: "fully recorded dates",
    progress: countFact("fullyRecordedDays"),
  }),
  definition({
    key: "strong-streak-3",
    category: "daily-rhythm",
    tier: 1,
    name: "Strong Start",
    description: "Answer Yes to the Strong check-in on three days in a row.",
    iconKey: "strong",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 3,
    unit: "days in your best run",
    progress: countFact("strongBestStreak"),
  }),
  definition({
    key: "strong-streak-7",
    category: "daily-rhythm",
    tier: 2,
    name: "Steady Week",
    description: "Answer Yes to the Strong check-in on seven days in a row.",
    iconKey: "strong",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 7,
    unit: "days in your best run",
    progress: countFact("strongBestStreak"),
  }),
  definition({
    key: "strong-streak-30",
    category: "daily-rhythm",
    tier: 3,
    name: "Enduring Strength",
    description: "Answer Yes to the Strong check-in on thirty days in a row.",
    iconKey: "strong",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 30,
    unit: "days in your best run",
    progress: countFact("strongBestStreak"),
  }),
  definition({
    key: "reading-streak-3",
    category: "daily-rhythm",
    tier: 1,
    name: "Three Days Reading",
    description: "Answer Yes to the Bible reading check on three days in a row.",
    iconKey: "open-book",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 3,
    unit: "days in your best run",
    progress: countFact("readingBestStreak"),
  }),
  definition({
    key: "reading-streak-7",
    category: "daily-rhythm",
    tier: 2,
    name: "A Week of Reading",
    description: "Answer Yes to the Bible reading check on seven days in a row.",
    iconKey: "open-book",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 7,
    unit: "days in your best run",
    progress: countFact("readingBestStreak"),
  }),
  definition({
    key: "reading-streak-30",
    category: "daily-rhythm",
    tier: 3,
    name: "Rooted in Reading",
    description: "Answer Yes to the Bible reading check on thirty days in a row.",
    iconKey: "open-book",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 30,
    unit: "days in your best run",
    progress: countFact("readingBestStreak"),
  }),
  definition({
    key: "tasks-streak-3",
    category: "daily-rhythm",
    tier: 1,
    name: "Plans in Motion",
    description: "Finish every task you planned, on three days in a row.",
    iconKey: "tasks",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 3,
    unit: "days in your best run",
    progress: countFact("taskBestStreak"),
  }),
  definition({
    key: "tasks-streak-7",
    category: "daily-rhythm",
    tier: 2,
    name: "A Week Completed",
    description: "Finish every task you planned, on seven days in a row.",
    iconKey: "tasks",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 7,
    unit: "days in your best run",
    progress: countFact("taskBestStreak"),
  }),
  definition({
    key: "tasks-streak-30",
    category: "daily-rhythm",
    tier: 3,
    name: "Steady Hands",
    description: "Finish every task you planned, on thirty days in a row.",
    iconKey: "tasks",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 30,
    unit: "days in your best run",
    progress: countFact("taskBestStreak"),
  }),

  definition({
    key: "reflections-7",
    category: "reflection-learning",
    name: "Considered Words",
    description: "Write a reflection on seven Bible reading days answered Yes.",
    iconKey: "reflection",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 7,
    unit: "reflected days",
    progress: countFact("reflectedReadingDays"),
  }),
  definition({
    key: "books-5",
    category: "reflection-learning",
    name: "Across the Library",
    description: "Record passages from five different Bible books.",
    iconKey: "library",
    href: "/daily-check-in",
    nextStep: "Continue in Daily Check-in",
    target: 5,
    unit: "books",
    progress: countFact("distinctBibleBooks"),
  }),
  definition({
    key: "first-spell",
    category: "reflection-learning",
    name: "First Spell",
    description: "Learn your first spell.",
    iconKey: "spell",
    href: "/profile#spells",
    nextStep: "Open Spells",
    target: 1,
    unit: "spells learned",
    progress: (facts) => facts.unlockedSpellKeys.length,
  }),
  definition({
    key: "spells-all",
    category: "reflection-learning",
    name: "Spellbook Complete",
    description: "Learn every spell in the current spellbook.",
    iconKey: "spellbook",
    href: "/profile#spells",
    nextStep: "Open Spells",
    target: () => SPELL_CATALOG.length,
    unit: "spells learned",
    progress: (facts) => facts.unlockedSpellKeys.length,
  }),

  definition({
    key: "trial-doubt",
    category: "trials",
    name: "Beyond Doubt",
    description: "Complete the trial The Doubt.",
    iconKey: "doubt",
    href: "/battle",
    nextStep: "Go to Battle",
    target: 1,
    unit: "trials completed",
    progress: hasTrial("the-doubt"),
  }),
  definition({
    key: "trial-distraction",
    category: "trials",
    name: "Focus Held",
    description: "Complete the trial The Distraction.",
    iconKey: "focus",
    href: "/battle",
    nextStep: "Go to Battle",
    target: 1,
    unit: "trials completed",
    progress: hasTrial("the-distraction"),
  }),
  definition({
    key: "trial-discouragement",
    category: "trials",
    name: "Rise Again",
    description: "Complete the trial The Discouragement.",
    iconKey: "rise",
    href: "/battle",
    nextStep: "Go to Battle",
    target: 1,
    unit: "trials completed",
    progress: hasTrial("the-discouragement"),
  }),
  definition({
    key: "trials-all",
    category: "trials",
    name: "Three Trials",
    description: "Complete all three trials.",
    iconKey: "three-trials",
    href: "/battle",
    nextStep: "Go to Battle",
    target: V1_TRIAL_KEYS.length,
    unit: "trials completed",
    progress: (facts) => V1_TRIAL_KEYS.filter((key) => facts.completedEncounterKeys.includes(key)).length,
  }),
  definition({
    key: "first-friendly-spar",
    category: "trials",
    name: "Good Company",
    description: "Finish one friendly battle that neither side forfeited. The result does not matter.",
    iconKey: "spar",
    href: "/battle",
    nextStep: "Go to Battle",
    target: 1,
    unit: "battles finished",
    progress: countFact("qualifyingPvpMatches"),
  }),
];

export const ACHIEVEMENTS = CATALOG.map((entry, index) => Object.freeze({ ...entry, order: index }));
export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.length;

const achievementByKey = new Map(ACHIEVEMENTS.map((entry) => [entry.key, entry]));

export function getAchievement(key) {
  return achievementByKey.get(key) || null;
}

export function getAchievementTarget(entry, facts) {
  const target = typeof entry.target === "function" ? entry.target(facts) : entry.target;
  return Math.max(1, toCount(target));
}

export function getAchievementProgress(entry, facts) {
  return Math.max(0, toCount(entry.progress(facts)));
}

export function qualifiesForAchievement(entry, facts) {
  return getAchievementProgress(entry, facts) >= getAchievementTarget(entry, facts);
}

export function getQualifiedKeys(facts) {
  const normalized = normalizeFacts(facts);
  return ACHIEVEMENTS.filter((entry) => qualifiesForAchievement(entry, normalized)).map((entry) => entry.key);
}

export function getMissingUnlockKeys(facts, unlockedKeys = []) {
  const existing = new Set(unlockedKeys);
  return getQualifiedKeys(facts).filter((key) => !existing.has(key));
}

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const unlockDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatUnlockDate(value) {
  const iso = toIsoString(value);
  return iso ? unlockDateFormatter.format(new Date(iso)) : null;
}

export function calculatePercent(current, target) {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

export function buildAchievementItem(entry, { facts, unlock = null }) {
  const target = getAchievementTarget(entry, facts);
  const unlockedAt = toIsoString(unlock?.unlockedAt);
  const isEarned = Boolean(unlock);
  const current = isEarned ? target : Math.min(target, Math.max(0, getAchievementProgress(entry, facts)));

  return {
    key: entry.key,
    category: entry.category,
    order: entry.order,
    tier: entry.tier,
    tierLabel: entry.tierLabel,
    name: entry.name,
    description: entry.description,
    iconKey: entry.iconKey,
    href: entry.href,
    nextStep: entry.nextStep,
    current,
    target,
    percent: calculatePercent(current, target),
    isProgressive: target > 1,
    status: isEarned
      ? ACHIEVEMENT_STATUS.EARNED
      : current > 0
        ? ACHIEVEMENT_STATUS.IN_PROGRESS
        : ACHIEVEMENT_STATUS.NOT_STARTED,
    unlockedAt,
    unlockedAtLabel: formatUnlockDate(unlockedAt),
  };
}

export function buildAchievementItems({ facts, unlocks = [] }) {
  const normalized = normalizeFacts(facts);
  const unlockByKey = new Map(
    (unlocks || [])
      .filter((row) => row && typeof row.achievementKey === "string")
      .map((row) => [row.achievementKey, row]),
  );

  return ACHIEVEMENTS.map((entry) =>
    buildAchievementItem(entry, { facts: normalized, unlock: unlockByKey.get(entry.key) || null }),
  );
}

export function summarizeAchievements(items) {
  const earned = items.filter((item) => item.status === ACHIEVEMENT_STATUS.EARNED).length;
  const inProgress = items.filter((item) => item.status === ACHIEVEMENT_STATUS.IN_PROGRESS).length;

  return {
    all: items.length,
    earned,
    inProgress,
    notStarted: items.length - earned - inProgress,
    percent: calculatePercent(earned, items.length),
  };
}

export function getLatestEarned(items) {
  return items
    .filter((item) => item.status === ACHIEVEMENT_STATUS.EARNED && item.unlockedAt)
    .sort((first, second) => {
      if (first.unlockedAt !== second.unlockedAt) return first.unlockedAt < second.unlockedAt ? 1 : -1;
      return first.order - second.order;
    })[0] || null;
}

export function getClosestNext(items, limit = 3) {
  return items
    .filter((item) => item.status !== ACHIEVEMENT_STATUS.EARNED)
    .map((item) => ({ item, ratio: item.target > 0 ? item.current / item.target : 0, remaining: item.target - item.current }))
    .sort((first, second) => {
      if (second.ratio !== first.ratio) return second.ratio - first.ratio;
      if (first.remaining !== second.remaining) return first.remaining - second.remaining;
      return first.item.order - second.item.order;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function groupByCategory(items) {
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const categoryItems = items.filter((item) => item.category === category.key);

    return {
      key: category.key,
      name: category.name,
      description: category.description,
      items: categoryItems,
      total: categoryItems.length,
      earnedCount: categoryItems.filter((item) => item.status === ACHIEVEMENT_STATUS.EARNED).length,
    };
  });
}
