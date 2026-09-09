import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_STATUS,
  ACHIEVEMENT_TOTAL,
  V1_TRIAL_KEYS,
  buildAchievementItems,
  getClosestNext,
  getLatestEarned,
  getMissingUnlockKeys,
  getQualifiedKeys,
  groupByCategory,
  normalizeFacts,
  summarizeAchievements,
} from "../src/domain/achievements.js";
import { SPELL_CATALOG } from "../src/domain/spells.js";
import {
  buildAchievementFacts,
  getAchievementsForUser,
} from "../src/services/achievementService.js";
import { findAchievementSources } from "../src/repositories/achievementRepository.js";

function itemsFor(facts, unlocks = []) {
  return buildAchievementItems({ facts: normalizeFacts(facts), unlocks });
}

function itemByKey(items, key) {
  const item = items.find((entry) => entry.key === key);
  assert.ok(item, `expected an item for ${key}`);
  return item;
}

function sources(overrides = {}) {
  return {
    gameProfile: null,
    strongRows: [],
    readingRows: [],
    goalRows: [],
    goalCheckInDateKeys: [],
    spellKeys: [],
    completedEncounterKeys: [],
    qualifyingPvpMatches: 0,
    ...overrides,
  };
}

function gatewayFor({ source = sources(), unlocks = [] } = {}) {
  const calls = { sources: [], unlocks: [], inserts: [] };
  let stored = [...unlocks];

  return {
    calls,
    get stored() {
      return stored;
    },
    async findAchievementSources(userId) {
      calls.sources.push(userId);
      return source;
    },
    async findAchievementUnlocks(userId) {
      calls.unlocks.push(userId);
      return stored.map((row) => ({ ...row }));
    },
    async createAchievementUnlocks({ userId, achievementKeys }) {
      calls.inserts.push({ userId, achievementKeys: [...achievementKeys] });
      const existing = new Set(stored.map((row) => row.achievementKey));
      const created = achievementKeys.filter((key) => !existing.has(key));
      stored = [
        ...stored,
        ...created.map((key) => ({ achievementKey: key, unlockedAt: new Date("2026-09-05T10:00:00.000Z") })),
      ];
      return created.length;
    },
  };
}

function dateKeys(count, startDay = 1) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, startDay + index));
    return date.toISOString().slice(0, 10);
  });
}

describe("achievement catalog", () => {
  it("ships exactly twenty-six achievements with unique stable keys", () => {
    assert.equal(ACHIEVEMENTS.length, 26);
    assert.equal(ACHIEVEMENT_TOTAL, 26);
    assert.equal(new Set(ACHIEVEMENTS.map((entry) => entry.key)).size, 26);
  });

  it("keeps the exact shipped key set", () => {
    assert.deepEqual(ACHIEVEMENTS.map((entry) => entry.key), [
      "first-check-in",
      "first-reading",
      "first-reflection",
      "five-finished",
      "character-formed",
      "full-record-1",
      "full-record-7",
      "full-record-30",
      "strong-streak-3",
      "strong-streak-7",
      "strong-streak-30",
      "reading-streak-3",
      "reading-streak-7",
      "reading-streak-30",
      "tasks-streak-3",
      "tasks-streak-7",
      "tasks-streak-30",
      "reflections-7",
      "books-5",
      "first-spell",
      "spells-all",
      "trial-doubt",
      "trial-distraction",
      "trial-discouragement",
      "trials-all",
      "first-friendly-spar",
    ]);
  });

  it("gives every definition the metadata the page renders", () => {
    const categoryKeys = new Set(ACHIEVEMENT_CATEGORIES.map((category) => category.key));

    ACHIEVEMENTS.forEach((definition, index) => {
      assert.equal(definition.order, index, `${definition.key} order`);
      assert.ok(categoryKeys.has(definition.category), `${definition.key} category`);
      assert.equal(typeof definition.name, "string");
      assert.ok(definition.name.length > 0, `${definition.key} name`);
      assert.ok(definition.description.length > 0, `${definition.key} description`);
      assert.ok(definition.iconKey.length > 0, `${definition.key} iconKey`);
      assert.match(definition.href, /^\//, `${definition.key} href`);
      assert.equal(typeof definition.progress, "function");
    });
  });

  it("uses the closed icon-key mapping", () => {
    const byKey = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.key, entry.iconKey]));

    assert.equal(byKey["first-check-in"], "first-step");
    assert.equal(byKey["first-reading"], "open-book");
    assert.equal(byKey["reading-streak-3"], "open-book");
    assert.equal(byKey["reading-streak-30"], "open-book");
    assert.equal(byKey["first-reflection"], "reflection");
    assert.equal(byKey["reflections-7"], "reflection");
    assert.equal(byKey["five-finished"], "five-checks");
    assert.equal(byKey["character-formed"], "character");
    assert.equal(byKey["full-record-30"], "three-part-day");
    assert.equal(byKey["strong-streak-7"], "strong");
    assert.equal(byKey["tasks-streak-7"], "tasks");
    assert.equal(byKey["books-5"], "library");
    assert.equal(byKey["first-spell"], "spell");
    assert.equal(byKey["spells-all"], "spellbook");
    assert.equal(byKey["trial-doubt"], "doubt");
    assert.equal(byKey["trial-distraction"], "focus");
    assert.equal(byKey["trial-discouragement"], "rise");
    assert.equal(byKey["trials-all"], "three-trials");
    assert.equal(byKey["first-friendly-spar"], "spar");
  });

  it("orders the four categories and covers every one of them", () => {
    assert.deepEqual(ACHIEVEMENT_CATEGORIES.map((category) => category.key), [
      "foundations",
      "daily-rhythm",
      "reflection-learning",
      "trials",
    ]);

    const covered = new Set(ACHIEVEMENTS.map((entry) => entry.category));
    ACHIEVEMENT_CATEGORIES.forEach((category) => assert.ok(covered.has(category.key)));
  });

  it("marks each milestone family with a tier and leaves single achievements untiered", () => {
    const byKey = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.key, entry]));

    assert.equal(byKey["full-record-1"].tier, 1);
    assert.equal(byKey["full-record-7"].tier, 2);
    assert.equal(byKey["full-record-30"].tier, 3);
    assert.equal(byKey["strong-streak-30"].tier, 3);
    assert.equal(byKey["tasks-streak-3"].tier, 1);
    assert.equal(byKey["first-check-in"].tier, null);
    assert.equal(byKey["books-5"].tier, null);
  });

  it("never uses shame or ranking language in user copy", () => {
    const forbidden = /\b(pure|perfect|failed|failure|sin|sinless|holier|worthy|unworthy)\b/i;

    ACHIEVEMENTS.forEach((definition) => {
      assert.doesNotMatch(definition.name, forbidden, definition.key);
      assert.doesNotMatch(definition.description, forbidden, definition.key);
    });
  });
});

describe("achievement thresholds", () => {
  const cases = [
    ["first-check-in", "strongRecordedDays", 1],
    ["first-reading", "readingYesDays", 1],
    ["first-reflection", "reflectedReadingDays", 1],
    ["five-finished", "fiveTaskDays", 1],
    ["full-record-1", "fullyRecordedDays", 1],
    ["full-record-7", "fullyRecordedDays", 7],
    ["full-record-30", "fullyRecordedDays", 30],
    ["strong-streak-3", "strongBestStreak", 3],
    ["strong-streak-7", "strongBestStreak", 7],
    ["strong-streak-30", "strongBestStreak", 30],
    ["reading-streak-3", "readingBestStreak", 3],
    ["reading-streak-7", "readingBestStreak", 7],
    ["reading-streak-30", "readingBestStreak", 30],
    ["tasks-streak-3", "taskBestStreak", 3],
    ["tasks-streak-7", "taskBestStreak", 7],
    ["tasks-streak-30", "taskBestStreak", 30],
    ["reflections-7", "reflectedReadingDays", 7],
    ["books-5", "distinctBibleBooks", 5],
  ];

  cases.forEach(([key, fact, target]) => {
    it(`${key} unlocks at ${target} ${fact} and not below`, () => {
      assert.equal(getQualifiedKeys(normalizeFacts({ [fact]: target - 1 })).includes(key), false);
      assert.ok(getQualifiedKeys(normalizeFacts({ [fact]: target })).includes(key));
      assert.ok(getQualifiedKeys(normalizeFacts({ [fact]: target + 5 })).includes(key));

      const item = itemByKey(itemsFor({ [fact]: target - 1 }), key);
      assert.equal(item.target, target);
      assert.equal(item.current, target - 1);
    });
  });

  it("unlocks character-formed only once the allocation is confirmed", () => {
    assert.equal(getQualifiedKeys(normalizeFacts({})).includes("character-formed"), false);
    assert.ok(getQualifiedKeys(normalizeFacts({ allocationConfirmed: true })).includes("character-formed"));
  });

  it("unlocks the friendly spar on the first qualifying match", () => {
    assert.equal(getQualifiedKeys(normalizeFacts({ qualifyingPvpMatches: 0 })).includes("first-friendly-spar"), false);
    assert.ok(getQualifiedKeys(normalizeFacts({ qualifyingPvpMatches: 1 })).includes("first-friendly-spar"));
  });

  it("tracks each trial by its own encounter key", () => {
    const facts = normalizeFacts({ completedEncounterKeys: ["the-distraction"] });
    const keys = getQualifiedKeys(facts);

    assert.ok(keys.includes("trial-distraction"));
    assert.equal(keys.includes("trial-doubt"), false);
    assert.equal(keys.includes("trials-all"), false);
    assert.equal(itemByKey(buildAchievementItems({ facts, unlocks: [] }), "trials-all").current, 1);
  });

  it("keeps trials-all fixed at the three v1 trials while spells-all follows the live catalog", () => {
    assert.deepEqual(V1_TRIAL_KEYS, ["the-doubt", "the-distraction", "the-discouragement"]);

    const trialsAll = itemByKey(
      itemsFor({ completedEncounterKeys: [...V1_TRIAL_KEYS, "a-future-trial"] }),
      "trials-all",
    );
    assert.equal(trialsAll.target, 3);
    assert.equal(trialsAll.current, 3);
    assert.equal(trialsAll.status, ACHIEVEMENT_STATUS.IN_PROGRESS);

    const spellsAll = itemByKey(itemsFor({ unlockedSpellKeys: [] }), "spells-all");
    assert.equal(spellsAll.target, SPELL_CATALOG.length);
    assert.ok(getQualifiedKeys(
      normalizeFacts({ unlockedSpellKeys: SPELL_CATALOG.map((spell) => spell.key) }),
    ).includes("spells-all"));
  });
});

describe("achievement fact rules", () => {
  it("counts a Strong No as a record and as a full-record day, never as a streak", () => {
    const facts = buildAchievementFacts(sources({
      strongRows: [{ dateKey: "2026-02-01", answer: "NO" }],
      readingRows: [{ dateKey: "2026-02-01", answer: "NO", hasReflection: false, bookCodes: [] }],
      goalCheckInDateKeys: ["2026-02-01"],
    }));

    assert.equal(facts.strongRecordedDays, 1);
    assert.equal(facts.strongBestStreak, 0);
    assert.equal(facts.fullyRecordedDays, 1);

    const keys = getQualifiedKeys(facts);
    assert.ok(keys.includes("first-check-in"));
    assert.ok(keys.includes("full-record-1"));
    assert.equal(keys.includes("strong-streak-3"), false);
  });

  it("counts a Bible No as a record but never as a reading, reflection or book fact", () => {
    const facts = buildAchievementFacts(sources({
      strongRows: [{ dateKey: "2026-02-01", answer: "YES" }],
      readingRows: [{ dateKey: "2026-02-01", answer: "NO", hasReflection: true, bookCodes: ["GEN"] }],
      goalCheckInDateKeys: ["2026-02-01"],
    }));

    assert.equal(facts.fullyRecordedDays, 1);
    assert.equal(facts.readingYesDays, 0);
    assert.equal(facts.readingBestStreak, 0);
    assert.equal(facts.reflectedReadingDays, 0);
    assert.equal(facts.distinctBibleBooks, 0);
  });

  it("counts an explicit Tasks No as a recorded date but never as a streak or a five-task day", () => {
    const facts = buildAchievementFacts(sources({
      strongRows: [{ dateKey: "2026-02-01", answer: "YES" }],
      readingRows: [{ dateKey: "2026-02-01", answer: "YES", hasReflection: false, bookCodes: ["GEN"] }],
      goalCheckInDateKeys: ["2026-02-01"],
    }));

    assert.equal(facts.fullyRecordedDays, 1);
    assert.equal(facts.taskBestStreak, 0);
    assert.equal(facts.fiveTaskDays, 0);
  });

  it("treats legacy DailyGoal rows without a check-in row as a recorded Tasks date", () => {
    const facts = buildAchievementFacts(sources({
      strongRows: [{ dateKey: "2026-02-01", answer: "YES" }],
      readingRows: [{ dateKey: "2026-02-01", answer: "YES", hasReflection: false, bookCodes: [] }],
      goalRows: [{ dateKey: "2026-02-01", completedAt: null }],
      goalCheckInDateKeys: [],
    }));

    assert.equal(facts.fullyRecordedDays, 1);
  });

  it("intersects the three sources and ignores duplicate rows", () => {
    const facts = buildAchievementFacts(sources({
      strongRows: [
        { dateKey: "2026-02-01", answer: "YES" },
        { dateKey: "2026-02-02", answer: "YES" },
      ],
      readingRows: [{ dateKey: "2026-02-01", answer: "YES", hasReflection: false, bookCodes: [] }],
      goalRows: [
        { dateKey: "2026-02-01", completedAt: new Date() },
        { dateKey: "2026-02-01", completedAt: null },
      ],
      goalCheckInDateKeys: ["2026-02-01", "2026-02-01", "2026-02-02"],
    }));

    assert.equal(facts.fullyRecordedDays, 1);
  });

  it("requires exactly five completed tasks for the five-finished day", () => {
    const complete = (dateKey, count, completedCount = count) =>
      Array.from({ length: count }, (_, index) => ({
        dateKey,
        completedAt: index < completedCount ? new Date("2026-02-01T10:00:00.000Z") : null,
      }));

    const four = buildAchievementFacts(sources({ goalRows: complete("2026-02-01", 4) }));
    assert.equal(four.fiveTaskDays, 0);

    const fiveIncomplete = buildAchievementFacts(sources({ goalRows: complete("2026-02-02", 5, 4) }));
    assert.equal(fiveIncomplete.fiveTaskDays, 0);

    const five = buildAchievementFacts(sources({ goalRows: complete("2026-02-03", 5) }));
    assert.equal(five.fiveTaskDays, 1);
    assert.ok(getQualifiedKeys(five).includes("five-finished"));
  });

  it("reuses the Profile and Statistics streak meanings", () => {
    const keys = dateKeys(3);
    const facts = buildAchievementFacts(sources({
      strongRows: [
        ...keys.map((dateKey) => ({ dateKey, answer: "YES" })),
        { dateKey: "2026-01-05", answer: "YES" },
      ],
      readingRows: keys.map((dateKey) => ({ dateKey, answer: "YES", hasReflection: true, bookCodes: ["GEN", "GEN"] })),
      goalRows: keys.flatMap((dateKey) => [
        { dateKey, completedAt: new Date("2026-01-01T10:00:00.000Z") },
        { dateKey, completedAt: new Date("2026-01-01T10:00:00.000Z") },
      ]),
    }));

    assert.equal(facts.strongBestStreak, 3);
    assert.equal(facts.readingBestStreak, 3);
    assert.equal(facts.taskBestStreak, 3);
    assert.equal(facts.reflectedReadingDays, 3);
    assert.equal(facts.distinctBibleBooks, 1);
  });

  it("reads the allocation, spell, trial and spar facts from their own sources", () => {
    const facts = buildAchievementFacts(sources({
      gameProfile: { allocationConfirmedAt: new Date("2026-02-01T10:00:00.000Z"), accentKey: "blue" },
      spellKeys: ["steady-breath", "clear-sight"],
      completedEncounterKeys: ["the-doubt"],
      qualifyingPvpMatches: 2,
    }));

    assert.equal(facts.allocationConfirmed, true);
    assert.deepEqual(facts.unlockedSpellKeys, ["steady-breath", "clear-sight"]);
    assert.deepEqual(facts.completedEncounterKeys, ["the-doubt"]);
    assert.equal(facts.qualifyingPvpMatches, 2);
  });
});

describe("achievement state and ordering", () => {
  it("keeps an earned achievement earned after its source progress falls", () => {
    const items = itemsFor(
      { strongBestStreak: 0 },
      [{ achievementKey: "strong-streak-7", unlockedAt: new Date("2026-08-01T09:00:00.000Z") }],
    );
    const item = itemByKey(items, "strong-streak-7");

    assert.equal(item.status, ACHIEVEMENT_STATUS.EARNED);
    assert.equal(item.current, 7);
    assert.equal(item.target, 7);
    assert.equal(item.percent, 100);
    assert.equal(item.unlockedAt, "2026-08-01T09:00:00.000Z");
  });

  it("separates in-progress from not-started by whether anything has happened", () => {
    const items = itemsFor({ fullyRecordedDays: 3 });

    assert.equal(itemByKey(items, "full-record-7").status, ACHIEVEMENT_STATUS.IN_PROGRESS);
    assert.equal(itemByKey(items, "books-5").status, ACHIEVEMENT_STATUS.NOT_STARTED);
    assert.equal(itemByKey(items, "books-5").current, 0);
  });

  it("clamps current and percent so a card never shows more than its target", () => {
    const items = itemsFor({ fullyRecordedDays: 44, strongBestStreak: -3 });

    const full = itemByKey(items, "full-record-30");
    assert.equal(full.current, 30);
    assert.equal(full.percent, 100);

    const strong = itemByKey(items, "strong-streak-3");
    assert.equal(strong.current, 0);
    assert.equal(strong.percent, 0);
  });

  it("rounds the percentage of a partial milestone", () => {
    assert.equal(itemByKey(itemsFor({ readingBestStreak: 5 }), "reading-streak-7").percent, 71);
  });

  it("marks only multi-step achievements as progressive", () => {
    const items = itemsFor({});

    assert.equal(itemByKey(items, "first-check-in").isProgressive, false);
    assert.equal(itemByKey(items, "trial-doubt").isProgressive, false);
    assert.equal(itemByKey(items, "reflections-7").isProgressive, true);
    assert.equal(itemByKey(items, "trials-all").isProgressive, true);
  });

  it("summarizes the four filter counts", () => {
    const items = itemsFor(
      { fullyRecordedDays: 3 },
      [{ achievementKey: "first-check-in", unlockedAt: new Date("2026-08-01T09:00:00.000Z") }],
    );
    const summary = summarizeAchievements(items);

    assert.equal(summary.all, 26);
    assert.equal(summary.earned, 1);
    assert.equal(summary.earned + summary.inProgress + summary.notStarted, 26);
    assert.equal(summary.percent, Math.round((1 / 26) * 100));
  });

  it("picks the newest unlock as latest earned and breaks a tie on catalog order", () => {
    const sameMoment = new Date("2026-08-02T09:00:00.000Z");
    const latest = getLatestEarned(itemsFor({}, [
      { achievementKey: "first-reading", unlockedAt: sameMoment },
      { achievementKey: "first-check-in", unlockedAt: sameMoment },
      { achievementKey: "trial-doubt", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
    ]));

    assert.equal(latest.key, "first-check-in");
    assert.equal(getLatestEarned(itemsFor({})), null);
  });

  it("returns at most three closest-next locked achievements by ratio, remainder and order", () => {
    const next = getClosestNext(itemsFor({
      readingBestStreak: 5,
      distinctBibleBooks: 3,
      strongBestStreak: 2,
      fullyRecordedDays: 1,
    }, [
      { achievementKey: "full-record-1", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
      { achievementKey: "reading-streak-3", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
    ]));

    assert.equal(next.length, 3);
    assert.deepEqual(next.map((item) => item.key), ["reading-streak-7", "strong-streak-3", "books-5"]);
    assert.equal(next.some((item) => item.status === ACHIEVEMENT_STATUS.EARNED), false);
  });

  it("offers beginner next steps to a user with no activity at all", () => {
    const next = getClosestNext(itemsFor({}));

    assert.deepEqual(next.map((item) => item.key), ["first-check-in", "first-reading", "first-reflection"]);
  });

  it("groups items into the four catalog categories in catalog order", () => {
    const groups = groupByCategory(itemsFor({}, [
      { achievementKey: "first-check-in", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
    ]));

    assert.deepEqual(groups.map((group) => group.key), [
      "foundations",
      "daily-rhythm",
      "reflection-learning",
      "trials",
    ]);
    assert.deepEqual(groups[0].items.map((item) => item.key), [
      "first-check-in",
      "first-reading",
      "first-reflection",
      "five-finished",
      "character-formed",
    ]);
    assert.equal(groups[0].earnedCount, 1);
    assert.equal(groups[0].total, 5);
    assert.equal(groups[1].items.length + groups[2].items.length + groups[3].items.length, 21);
  });

  it("ignores an unknown stored unlock key without deleting anything", () => {
    const items = itemsFor({}, [
      { achievementKey: "a-removed-achievement", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
      { achievementKey: "first-check-in", unlockedAt: new Date("2026-08-01T09:00:00.000Z") },
    ]);

    assert.equal(items.length, 26);
    assert.equal(items.some((item) => item.key === "a-removed-achievement"), false);
    assert.equal(summarizeAchievements(items).earned, 1);
  });

  it("lists only the qualified keys that have no unlock row yet", () => {
    const facts = normalizeFacts({ strongRecordedDays: 1, allocationConfirmed: true });

    assert.deepEqual(getMissingUnlockKeys(facts, ["first-check-in"]), ["character-formed"]);
    assert.deepEqual(getMissingUnlockKeys(facts, ["first-check-in", "character-formed"]), []);
  });
});

describe("achievement reconciliation", () => {
  const historicalSource = sources({
    gameProfile: { allocationConfirmedAt: new Date("2026-01-01T10:00:00.000Z"), accentKey: "rose" },
    strongRows: dateKeys(3).map((dateKey) => ({ dateKey, answer: "YES" })),
    readingRows: dateKeys(3).map((dateKey) => ({ dateKey, answer: "YES", hasReflection: true, bookCodes: ["GEN"] })),
    goalCheckInDateKeys: dateKeys(3),
  });

  it("credits existing history on the first page visit", async () => {
    const gateway = gatewayFor({ source: historicalSource });
    const view = await getAchievementsForUser(41, gateway);

    assert.deepEqual(gateway.calls.sources, [41]);
    assert.ok(gateway.calls.inserts[0].achievementKeys.includes("first-check-in"));
    assert.ok(gateway.calls.inserts[0].achievementKeys.includes("strong-streak-3"));
    assert.equal(gateway.calls.inserts[0].userId, 41);
    assert.ok(view.summary.earned >= 6);
  });

  it("inserts nothing and creates no duplicate on a repeated visit", async () => {
    const gateway = gatewayFor({ source: historicalSource });
    const first = await getAchievementsForUser(41, gateway);
    const second = await getAchievementsForUser(41, gateway);

    assert.equal(gateway.calls.inserts.length, 1);
    assert.equal(first.summary.earned, second.summary.earned);
    assert.equal(new Set(gateway.stored.map((row) => row.achievementKey)).size, gateway.stored.length);
  });

  it("never deletes an unlock whose source progress has since disappeared", async () => {
    const gateway = gatewayFor({
      source: sources(),
      unlocks: [{ achievementKey: "strong-streak-30", unlockedAt: new Date("2026-05-01T09:00:00.000Z") }],
    });
    const view = await getAchievementsForUser(41, gateway);

    assert.equal(gateway.stored.length, 1);
    const item = view.categories
      .flatMap((category) => category.items)
      .find((entry) => entry.key === "strong-streak-30");
    assert.equal(item.status, ACHIEVEMENT_STATUS.EARNED);
  });

  it("reads and writes only for the authenticated owner", async () => {
    const gateway = gatewayFor({ source: historicalSource });
    await getAchievementsForUser(41, gateway);

    assert.ok(gateway.calls.sources.every((id) => id === 41));
    assert.ok(gateway.calls.unlocks.every((id) => id === 41));
    assert.ok(gateway.calls.inserts.every((call) => call.userId === 41));
  });

  it("rejects a non-numeric or missing user id rather than reading anything", async () => {
    const gateway = gatewayFor();

    await assert.rejects(() => getAchievementsForUser(undefined, gateway));
    await assert.rejects(() => getAchievementsForUser("7; drop", gateway));
    assert.equal(gateway.calls.sources.length, 0);
  });

  it("sanitizes the stored accent against the preset allowlist", async () => {
    const good = await getAchievementsForUser(41, gatewayFor({
      source: sources({ gameProfile: { allocationConfirmedAt: null, accentKey: "blue" } }),
    }));
    assert.equal(good.accentKey, "blue");

    const bad = await getAchievementsForUser(41, gatewayFor({
      source: sources({ gameProfile: { allocationConfirmedAt: null, accentKey: "<script>" } }),
    }));
    assert.equal(bad.accentKey, "neutral");

    const missing = await getAchievementsForUser(41, gatewayFor({ source: sources({ gameProfile: null }) }));
    assert.equal(missing.accentKey, "neutral");
  });

  it("builds a page DTO that carries no private source text", async () => {
    const gateway = gatewayFor({ source: historicalSource });
    const view = await getAchievementsForUser(41, gateway);
    const serialized = JSON.stringify(view);

    assert.doesNotMatch(serialized, /reflection"\s*:\s*"/);
    assert.doesNotMatch(serialized, /hasReflection/);
    assert.doesNotMatch(serialized, /bookCode/i);
    assert.doesNotMatch(serialized, /dateKey/);
    assert.doesNotMatch(serialized, /passwordHash|telegram|prayer|characterSnapshot/i);
    assert.equal(view.total, 26);
    assert.equal(view.categories.flatMap((category) => category.items).length, 26);

    const item = view.categories[0].items[0];
    assert.deepEqual(Object.keys(item).sort(), [
      "category",
      "current",
      "description",
      "href",
      "iconKey",
      "isProgressive",
      "key",
      "name",
      "nextStep",
      "order",
      "percent",
      "status",
      "target",
      "tier",
      "tierLabel",
      "unlockedAt",
      "unlockedAtLabel",
    ]);
  });
});

describe("achievement repository queries", () => {
  function fakeClient() {
    const seen = {};
    const record = (name) => ({
      findMany: async (args) => {
        seen[name] = args;
        return [];
      },
      findUnique: async (args) => {
        seen[name] = args;
        return null;
      },
      count: async (args) => {
        seen[name] = args;
        return 0;
      },
      createMany: async (args) => {
        seen[name] = args;
        return { count: args.data.length };
      },
    });

    return {
      seen,
      gameProfile: record("gameProfile"),
      checkInHistory: record("checkInHistory"),
      readingCheckIn: record("readingCheckIn"),
      dailyGoal: record("dailyGoal"),
      dailyGoalCheckIn: record("dailyGoalCheckIn"),
      spellUnlock: record("spellUnlock"),
      pveProgress: record("pveProgress"),
      battleParticipant: record("battleParticipant"),
      achievementUnlock: record("achievementUnlock"),
    };
  }

  it("scopes every source read to the owner", async () => {
    const client = fakeClient();
    await findAchievementSources(41, client);

    assert.equal(client.seen.gameProfile.where.id, 41);
    assert.equal(client.seen.checkInHistory.where.userId, 41);
    assert.equal(client.seen.readingCheckIn.where.userId, 41);
    assert.equal(client.seen.dailyGoal.where.userId, 41);
    assert.equal(client.seen.dailyGoalCheckIn.where.userId, 41);
    assert.equal(client.seen.spellUnlock.where.userId, 41);
    assert.equal(client.seen.pveProgress.where.userId, 41);
    assert.equal(client.seen.battleParticipant.where.userId, 41);
  });

  it("selects the minimum fields and no goal or prayer text", async () => {
    const client = fakeClient();
    await findAchievementSources(41, client);

    assert.deepEqual(client.seen.checkInHistory.select, { dateKey: true, answer: true });
    assert.deepEqual(client.seen.dailyGoal.select, { dateKey: true, completedAt: true });
    assert.deepEqual(client.seen.dailyGoalCheckIn.select, { dateKey: true });
    assert.equal(client.seen.dailyGoal.select.text, undefined);
    assert.equal(client.seen.gameProfile.select.emblemKey, undefined);
    assert.deepEqual(Object.keys(client.seen.gameProfile.select).sort(), ["accentKey", "allocationConfirmedAt"]);
  });

  it("counts only completed, non-forfeited PvP battles and ignores the result", async () => {
    const client = fakeClient();
    await findAchievementSources(41, client);
    const where = client.seen.battleParticipant.where;

    assert.equal(where.userId, 41);
    assert.equal(where.battle.mode, "PVP");
    assert.equal(where.battle.status, "COMPLETED");
    assert.deepEqual(where.battle.actions, { none: { actionType: "FORFEIT" } });
    assert.equal(where.result, undefined);
    assert.equal(JSON.stringify(where).includes("WIN"), false);
  });

  it("reduces the reflection to a boolean and never returns its text", async () => {
    const client = fakeClient();
    client.readingCheckIn.findMany = async () => [
      { dateKey: "2026-02-01", answer: "YES", reflection: "  a private thought  ", passages: [{ bookCode: "GEN" }] },
      { dateKey: "2026-02-02", answer: "YES", reflection: "   ", passages: [] },
    ];

    const result = await findAchievementSources(41, client);

    assert.deepEqual(result.readingRows, [
      { dateKey: "2026-02-01", answer: "YES", hasReflection: true, bookCodes: ["GEN"] },
      { dateKey: "2026-02-02", answer: "YES", hasReflection: false, bookCodes: [] },
    ]);
    assert.equal(JSON.stringify(result).includes("private thought"), false);
  });
});
