import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultLoadout,
  orderUnlockedKeys,
  resolveLoadout,
  validateLoadout,
} from "../src/domain/loadout.js";
import { getLoadoutPower } from "../src/domain/spells.js";
import { buildCharacterSnapshot, getCombatRating, getDerived } from "../src/domain/stats.js";
import { EQUIPPED_SPELL_LIMIT } from "../src/domain/constants.js";

const unlock = (spellKey, iso) => ({ spellKey, unlockedAt: new Date(iso) });

const UNLOCKS = [
  unlock("dawn-break", "2026-03-01T10:00:00Z"),
  unlock("steady-breath", "2026-01-01T10:00:00Z"),
  unlock("still-water", "2026-02-01T10:00:00Z"),
  unlock("kindled-lamp", "2026-04-01T10:00:00Z"),
];

describe("deterministic unlock order", () => {
  it("orders by unlock time, then by key", () => {
    assert.deepEqual(orderUnlockedKeys(UNLOCKS), [
      "steady-breath",
      "still-water",
      "dawn-break",
      "kindled-lamp",
    ]);
  });

  it("breaks a tie in unlock time by key, so the order never depends on row order", () => {
    const sameMoment = [
      unlock("still-water", "2026-01-01T10:00:00Z"),
      unlock("clear-sight", "2026-01-01T10:00:00Z"),
      unlock("dawn-break", "2026-01-01T10:00:00Z"),
    ];

    assert.deepEqual(orderUnlockedKeys(sameMoment), ["clear-sight", "dawn-break", "still-water"]);
    assert.deepEqual(orderUnlockedKeys([...sameMoment].reverse()), ["clear-sight", "dawn-break", "still-water"]);
  });

  it("ignores keys that are not in the catalog", () => {
    assert.deepEqual(orderUnlockedKeys([unlock("not-a-spell", "2026-01-01T10:00:00Z")]), []);
  });
});

describe("the deterministic default", () => {
  it("is the first three unlocked spells and is stable across repeated runs", () => {
    const first = defaultLoadout(UNLOCKS);

    assert.deepEqual(first, ["steady-breath", "still-water", "dawn-break"]);
    assert.deepEqual(defaultLoadout(UNLOCKS), first, "repeatable");
    assert.equal(first.length, EQUIPPED_SPELL_LIMIT);
  });

  it("is everything a user has, when they have fewer than three", () => {
    assert.deepEqual(defaultLoadout(UNLOCKS.slice(0, 1)), ["dawn-break"]);
    assert.deepEqual(defaultLoadout([]), []);
  });
});

describe("resolving a stored loadout", () => {
  const stored = (keys) => resolveLoadout({ equippedKeys: keys, unlocks: UNLOCKS });

  it("keeps a valid stored selection exactly as the user set it", () => {
    assert.deepEqual(stored(["dawn-break", "steady-breath"]), ["dawn-break", "steady-breath"]);
  });

  it("drops a key the user has not unlocked", () => {
    assert.deepEqual(stored(["dawn-break", "second-wind"]), ["dawn-break"]);
  });

  it("drops an unknown key and a duplicate", () => {
    assert.deepEqual(stored(["dawn-break", "dawn-break", "fireball"]), ["dawn-break"]);
  });

  it("never returns more than the limit", () => {
    const all = stored(["steady-breath", "still-water", "dawn-break", "kindled-lamp"]);

    assert.equal(all.length, EQUIPPED_SPELL_LIMIT);
  });

  it("falls back to the default when nothing valid is stored but spells are unlocked", () => {
    assert.deepEqual(stored([]), defaultLoadout(UNLOCKS), "an empty column is a new user, not a choice");
    assert.deepEqual(stored(["fireball"]), defaultLoadout(UNLOCKS));
    assert.deepEqual(stored(null), defaultLoadout(UNLOCKS));
  });

  it("is empty, and legitimately so, for a user with no unlocks at all", () => {
    assert.deepEqual(resolveLoadout({ equippedKeys: [], unlocks: [] }), []);
    assert.deepEqual(resolveLoadout({ equippedKeys: ["dawn-break"], unlocks: [] }), []);
  });
});

describe("validating a requested loadout", () => {
  const unlockedKeys = UNLOCKS.map((row) => row.spellKey);
  const check = (spellKeys) => validateLoadout({ spellKeys, unlockedKeys });

  it("accepts up to three unique unlocked spells", () => {
    const result = check(["dawn-break", "steady-breath", "still-water"]);

    assert.equal(result.valid, true);
    assert.deepEqual(result.spellKeys, ["dawn-break", "steady-breath", "still-water"]);
  });

  it("accepts one or two", () => {
    assert.equal(check(["dawn-break"]).valid, true);
    assert.equal(check(["dawn-break", "still-water"]).valid, true);
  });

  it("refuses more than three", () => {
    const result = check(["dawn-break", "steady-breath", "still-water", "kindled-lamp"]);

    assert.equal(result.valid, false);
    assert.match(result.reason, /three/i);
  });

  it("refuses a duplicate", () => {
    const result = check(["dawn-break", "dawn-break"]);

    assert.equal(result.valid, false);
    assert.match(result.reason, /once/i);
  });

  it("refuses a spell that does not exist", () => {
    assert.equal(check(["fireball"]).valid, false);
  });

  it("refuses a spell the user has not unlocked", () => {
    const result = check(["second-wind"]);

    assert.equal(result.valid, false);
    assert.match(result.reason, /not learned|have not/i);
  });

  it("refuses an empty loadout while the user has spells to equip", () => {
    const result = check([]);

    assert.equal(result.valid, false);
    assert.match(result.reason, /at least one/i);
  });

  it("accepts an empty loadout when nothing is unlocked", () => {
    assert.equal(validateLoadout({ spellKeys: [], unlockedKeys: [] }).valid, true);
  });
});

describe("rating from equipped power", () => {
  it("values a loadout by what is equipped, not by lifetime unlocks", () => {
    const everything = getLoadoutPower(["steady-breath", "still-water", "dawn-break", "kindled-lamp"]);
    const equipped = getLoadoutPower(["steady-breath", "still-water", "dawn-break"]);

    assert.ok(equipped < everything, "the unequipped spell contributes nothing to a battle");
  });

  it("weighs a stronger loadout above a weaker one of the same size", () => {
    assert.ok(
      getLoadoutPower(["dawn-break", "second-wind", "kindled-lamp"])
        > getLoadoutPower(["steady-breath", "clear-sight", "quiet-resolve"]),
    );
  });

  it("ignores unknown and duplicated keys so a stale column cannot inflate a rating", () => {
    assert.equal(getLoadoutPower(["dawn-break", "dawn-break", "fireball"]), getLoadoutPower(["dawn-break"]));
  });

  it("feeds the snapshot rating through the same transparent formula", () => {
    const snapshot = buildCharacterSnapshot({
      totals: { strength: 5, dexterity: 4, intelligence: 3, wisdom: 2 },
      unlockedSpellKeys: ["steady-breath", "still-water", "dawn-break", "kindled-lamp"],
      equippedSpellKeys: ["dawn-break", "still-water"],
    });

    assert.deepEqual(snapshot.spellKeys, ["dawn-break", "still-water"], "a battle freezes the equipped keys");
    assert.equal(
      snapshot.rating,
      getCombatRating(getDerived(snapshot.stats), getLoadoutPower(["dawn-break", "still-water"])),
    );
  });

  it("still accepts a caller that only knows about unlocks", () => {
    const snapshot = buildCharacterSnapshot({
      totals: { strength: 5, dexterity: 4, intelligence: 3, wisdom: 2 },
      unlockedSpellKeys: ["steady-breath"],
    });

    assert.deepEqual(snapshot.spellKeys, ["steady-breath"]);
  });
});

describe("the loadout request contract", () => {
  it("accepts a list of up to three spell keys", async () => {
    const { loadoutSchema } = await import("../src/validators/gameValidators.js");

    assert.equal(loadoutSchema.safeParse({ spellKeys: [] }).success, true);
    assert.equal(loadoutSchema.safeParse({ spellKeys: ["dawn-break"] }).success, true);
    assert.equal(
      loadoutSchema.safeParse({ spellKeys: ["dawn-break", "still-water", "steady-breath"] }).success,
      true,
    );
  });

  it("refuses a fourth spell, a non-string key and a missing list at the boundary", async () => {
    const { loadoutSchema } = await import("../src/validators/gameValidators.js");

    assert.equal(loadoutSchema.safeParse({ spellKeys: ["a", "b", "c", "d"] }).success, false);
    assert.equal(loadoutSchema.safeParse({ spellKeys: [7] }).success, false);
    assert.equal(loadoutSchema.safeParse({}).success, false);
    assert.equal(loadoutSchema.safeParse({ spellKeys: ["dawn-break"], extra: 1 }).success, false);
  });
});

describe("stable error codes", () => {
  it("carries an optional machine-readable code without changing the old shape", async () => {
    const { AppError } = await import("../src/utils/appError.js");

    const plain = new AppError("Battle not found", 404);
    assert.equal(plain.statusCode, 404);
    assert.equal(plain.code, undefined, "an existing caller gains no field");

    const coded = new AppError("Carry at least one spell", 409, "LOADOUT_INVALID");
    assert.equal(coded.code, "LOADOUT_INVALID");
  });

  it("maps a cooldown refusal to a 409 with its own code", async () => {
    const { toAppError } = await import("../src/services/battleService.js");
    const { CombatError } = await import("../src/domain/combat.js");

    const mapped = toAppError(new CombatError("Steady Breath is ready again in 2 turns", "SPELL_ON_COOLDOWN"));

    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.code, "SPELL_ON_COOLDOWN");
  });

  it("still maps the version 2 refusals exactly as it did", async () => {
    const { toAppError } = await import("../src/services/battleService.js");
    const { CombatError } = await import("../src/domain/combat.js");

    assert.equal(toAppError(new CombatError("nope", "OUT_OF_TURN")).statusCode, 409);
    assert.equal(toAppError(new CombatError("nope", "UNSUPPORTED_ACTION")).statusCode, 422);
  });
});
