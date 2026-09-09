import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCharacterSnapshot,
  getCombatRating,
  getDerived,
  getTotals,
  validateAllocation,
} from "../src/domain/stats.js";
import { BASE_POINT_TOTAL } from "../src/domain/constants.js";

describe("getTotals", () => {
  it("adds earned rewards to the base allocation", () => {
    const totals = getTotals(
      { strength: 4, dexterity: 3, intelligence: 3 },
      [
        { stat: "strength", amount: 1 },
        { stat: "strength", amount: 1 },
        { stat: "wisdom", amount: 1 },
      ],
    );

    assert.deepEqual(totals, { strength: 6, dexterity: 3, intelligence: 3, wisdom: 1 });
  });

  it("starts wisdom at zero because base points cannot reach it", () => {
    const totals = getTotals({ strength: 10, dexterity: 0, intelligence: 0, wisdom: 5 });

    assert.equal(totals.wisdom, 0);
  });

  it("treats a reward without an explicit amount as one point", () => {
    const totals = getTotals({}, [{ stat: "intelligence" }]);

    assert.equal(totals.intelligence, 1);
  });

  it("ignores rewards for an unknown stat", () => {
    const totals = getTotals({}, [{ stat: "charisma", amount: 9 }]);

    assert.deepEqual(totals, { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0 });
  });
});

describe("getDerived", () => {
  it("derives health and damage from strength", () => {
    const derived = getDerived({ strength: 5 });

    assert.equal(derived.maxHealth, 140);
    assert.equal(derived.basicDamage, 18);
  });

  it("derives mana from intelligence", () => {
    assert.equal(getDerived({ intelligence: 6 }).maxMana, 50);
  });

  it("derives speed from dexterity with a floor of one", () => {
    assert.equal(getDerived({ dexterity: 0 }).speed, 1);
    assert.equal(getDerived({ dexterity: 7 }).speed, 7);
  });

  it("gives a zero character the documented starting line", () => {
    assert.deepEqual(getDerived({}), {
      maxHealth: 100,
      basicDamage: 8,
      maxMana: 20,
      speed: 1,
    });
  });
});

describe("getCombatRating", () => {
  it("rises when any contributing stat rises", () => {
    const base = getCombatRating(getDerived({ strength: 3, dexterity: 3, intelligence: 3 }), 0);
    const stronger = getCombatRating(getDerived({ strength: 4, dexterity: 3, intelligence: 3 }), 0);
    const faster = getCombatRating(getDerived({ strength: 3, dexterity: 4, intelligence: 3 }), 0);
    const smarter = getCombatRating(getDerived({ strength: 3, dexterity: 3, intelligence: 4 }), 0);

    assert.ok(stronger > base);
    assert.ok(faster > base);
    assert.ok(smarter > base);
  });

  it("counts unlocked spells as real power", () => {
    const derived = getDerived({ strength: 3, dexterity: 3, intelligence: 4 });

    assert.equal(getCombatRating(derived, 2) - getCombatRating(derived, 0), 8);
  });
});

describe("validateAllocation", () => {
  it("accepts exactly ten points across the three allocatable stats", () => {
    const result = validateAllocation({ strength: 4, dexterity: 3, intelligence: 3 });

    assert.equal(result.valid, true);
    assert.deepEqual(result.allocation, { strength: 4, dexterity: 3, intelligence: 3 });
  });

  it("rejects a sum below ten", () => {
    const result = validateAllocation({ strength: 4, dexterity: 3, intelligence: 2 });

    assert.equal(result.valid, false);
    assert.match(result.reason, /exactly 10/);
  });

  it("rejects a sum above ten", () => {
    assert.equal(validateAllocation({ strength: 5, dexterity: 5, intelligence: 5 }).valid, false);
  });

  it("rejects negative points", () => {
    assert.equal(validateAllocation({ strength: -1, dexterity: 6, intelligence: 5 }).valid, false);
  });

  it("rejects fractional points", () => {
    assert.equal(validateAllocation({ strength: 3.5, dexterity: 3.5, intelligence: 3 }).valid, false);
  });

  it("rejects any attempt to allocate wisdom", () => {
    const result = validateAllocation({ strength: 4, dexterity: 3, intelligence: 3, wisdom: 0 });

    assert.equal(result.valid, false);
    assert.match(result.reason, /Wisdom is earned/);
  });

  it("accepts every zero-inclusive split that sums to the base total", () => {
    const result = validateAllocation({ strength: BASE_POINT_TOTAL, dexterity: 0, intelligence: 0 });

    assert.equal(result.valid, true);
  });
});

describe("buildCharacterSnapshot", () => {
  it("freezes stats, derived values, rating and spells together", () => {
    const snapshot = buildCharacterSnapshot({
      id: 7,
      name: "Tester",
      totals: { strength: 5, dexterity: 4, intelligence: 3, wisdom: 2 },
      unlockedSpellKeys: ["steady-breath"],
    });

    assert.equal(snapshot.id, 7);
    assert.equal(snapshot.derived.maxHealth, 140);
    assert.equal(snapshot.rating, getCombatRating(snapshot.derived, 1));
    assert.deepEqual(snapshot.spellKeys, ["steady-breath"]);
  });

  it("copies the spell list so later unlocks cannot mutate a stored snapshot", () => {
    const keys = ["steady-breath"];
    const snapshot = buildCharacterSnapshot({ totals: {}, unlockedSpellKeys: keys });
    keys.push("dawn-break");

    assert.deepEqual(snapshot.spellKeys, ["steady-breath"]);
  });
});
