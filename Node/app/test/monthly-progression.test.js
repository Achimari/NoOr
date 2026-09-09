import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEffectiveMonthRange, getMonthRangeForDateKey } from "../src/utils/dateKey.js";
import { getMonthlyTotals } from "../src/domain/progression.js";
import { canUnlock, describeCatalog, findSpell } from "../src/domain/spells.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { createBattleState } from "../src/domain/combat.js";

describe("effective month range", () => {
  it("returns an inclusive start and an exclusive end for a date key", () => {
    assert.deepEqual(getMonthRangeForDateKey("2026-09-04"), {
      monthKey: "2026-09",
      startDateKey: "2026-09-01",
      endDateKeyExclusive: "2026-10-01",
    });
  });

  it("rolls December into the next January", () => {
    assert.deepEqual(getMonthRangeForDateKey("2026-12-31"), {
      monthKey: "2026-12",
      startDateKey: "2026-12-01",
      endDateKeyExclusive: "2027-01-01",
    });
  });
});

describe("effective month for a user", () => {
  const acrossMidnight = new Date("2026-08-31T21:30:00Z");

  it("uses the target user's timezone", () => {
    assert.equal(getEffectiveMonthRange(acrossMidnight, "Europe/Riga", 0).monthKey, "2026-09");
    assert.equal(getEffectiveMonthRange(acrossMidnight, "Europe/London", 0).monthKey, "2026-08");
  });

  it("respects the configured daily reset hour on the first of the month", () => {
    const justAfterMidnight = new Date("2026-08-31T22:00:00Z");

    assert.equal(getEffectiveMonthRange(justAfterMidnight, "Europe/Riga", 4).monthKey, "2026-08");
    assert.equal(getEffectiveMonthRange(justAfterMidnight, "Europe/Riga", 0).monthKey, "2026-09");
  });

  it("crosses December into January", () => {
    const newYear = new Date("2027-01-01T05:00:00Z");

    assert.equal(getEffectiveMonthRange(newYear, "Europe/Riga", 0).monthKey, "2027-01");
    assert.equal(getEffectiveMonthRange(newYear, "Europe/Riga", 0).startDateKey, "2027-01-01");
    assert.equal(getEffectiveMonthRange(newYear, "Europe/Riga", 0).endDateKeyExclusive, "2027-02-01");
  });
});

describe("monthly totals", () => {
  const base = { strength: 4, dexterity: 3, intelligence: 3 };
  const range = getMonthRangeForDateKey("2026-09-04");

  const reward = (stat, dateKey) => ({ stat, source: "TEST", dateKey, amount: 1 });
  const ledger = [
    reward("strength", "2026-08-30"),
    reward("dexterity", "2026-08-30"),
    reward("intelligence", "2026-08-31"),
    reward("wisdom", "2026-08-31"),
    reward("strength", "2026-09-02"),
    reward("wisdom", "2026-09-03"),
  ];

  it("keeps the ten base points across a month boundary", () => {
    const { totals, earned } = getMonthlyTotals({ base, rewards: ledger, monthRange: range });

    assert.equal(totals.strength - earned.strength, base.strength);
    assert.equal(totals.dexterity - earned.dexterity, base.dexterity);
    assert.equal(totals.intelligence - earned.intelligence, base.intelligence);
  });

  it("counts this month's rewards and ignores last month's", () => {
    const { totals, earned } = getMonthlyTotals({ base, rewards: ledger, monthRange: range });

    assert.deepEqual(earned, { strength: 1, dexterity: 0, intelligence: 0, wisdom: 1 });
    assert.deepEqual(totals, { strength: 5, dexterity: 3, intelligence: 3, wisdom: 1 });
  });

  it("zeroes all four earned values in a month with no rewards yet", () => {
    const fresh = getMonthlyTotals({
      base,
      rewards: ledger,
      monthRange: getMonthRangeForDateKey("2026-10-01"),
    });

    assert.deepEqual(fresh.earned, { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0 });
    assert.deepEqual(fresh.totals, { ...base, wisdom: 0 });
  });

  it("leaves the ledger it was given untouched, so history stays auditable", () => {
    const before = structuredClone(ledger);
    getMonthlyTotals({ base, rewards: ledger, monthRange: range });

    assert.deepEqual(ledger, before);
    assert.equal(ledger.length, 6);
  });

  it("includes the first and last day of the month and excludes the neighbours", () => {
    const boundary = [
      reward("strength", "2026-08-31"),
      reward("dexterity", "2026-09-01"),
      reward("intelligence", "2026-09-30"),
      reward("wisdom", "2026-10-01"),
    ];

    const { earned } = getMonthlyTotals({ base, rewards: boundary, monthRange: range });

    assert.deepEqual(earned, { strength: 0, dexterity: 1, intelligence: 1, wisdom: 0 });
  });
});

describe("what the monthly reset must not touch", () => {
  const base = { strength: 4, dexterity: 3, intelligence: 3 };
  const ledger = [
    { stat: "wisdom", source: "REFLECTION", dateKey: "2026-09-02", amount: 1 },
    { stat: "wisdom", source: "REFLECTION", dateKey: "2026-09-03", amount: 1 },
    { stat: "strength", source: "RECOVERY", dateKey: "2026-09-03", amount: 1 },
  ];

  it("keeps a spell unlocked after the Wisdom it qualified with has reset", () => {
    const september = getMonthlyTotals({ base, rewards: ledger, monthRange: getMonthRangeForDateKey("2026-09-30") });
    assert.equal(september.totals.wisdom, 2);
    assert.equal(canUnlock(findSpell("clear-sight"), september.totals.wisdom), true);

    const october = getMonthlyTotals({ base, rewards: ledger, monthRange: getMonthRangeForDateKey("2026-10-01") });
    assert.equal(october.totals.wisdom, 0, "Wisdom is a this-month figure");

    const catalog = describeCatalog({ wisdom: october.totals.wisdom, unlockedKeys: ["clear-sight"] });
    const byKey = Object.fromEntries(catalog.map((spell) => [spell.key, spell]));

    assert.equal(byKey["clear-sight"].unlocked, true);
    assert.equal(byKey["quiet-resolve"].unlocked, false);
    assert.equal(byKey["quiet-resolve"].available, false);
  });

  it("leaves a battle that has already started on its frozen snapshot", () => {
    const september = getMonthlyTotals({ base, rewards: ledger, monthRange: getMonthRangeForDateKey("2026-09-30") });
    const frozen = buildCharacterSnapshot({ totals: september.totals, unlockedSpellKeys: ["clear-sight"], name: "You" });
    const state = createBattleState({ playerSnapshot: frozen, opponentSnapshot: frozen });

    const october = getMonthlyTotals({ base, rewards: ledger, monthRange: getMonthRangeForDateKey("2026-10-01") });
    assert.notDeepEqual(october.totals, september.totals);

    assert.deepEqual(state.combatants.PLAYER.stats, september.totals);
    assert.equal(state.combatants.PLAYER.derived.maxHealth, frozen.derived.maxHealth);
    assert.deepEqual(state.combatants.PLAYER.spellKeys, ["clear-sight"]);
  });
});

