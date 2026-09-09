import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENCOUNTERS,
  buildBossSnapshot,
  clampBossRating,
  findEncounter,
  getBossAction,
  scaleBoss,
} from "../src/domain/bosses.js";
import { getCombatRating, getDerived } from "../src/domain/stats.js";
import { describeCatalog, canUnlock, findSpell, isKnownSpell, SPELL_CATALOG } from "../src/domain/spells.js";

const [doubt, distraction, discouragement] = ENCOUNTERS;

describe("encounters", () => {
  it("ships three ordered story trials", () => {
    assert.equal(ENCOUNTERS.length, 3);
    assert.deepEqual(ENCOUNTERS.map((e) => e.order), [1, 2, 3]);
  });

  it("gives every encounter a distinct learnable pattern", () => {
    const patterns = ENCOUNTERS.map((e) => e.pattern.join(","));

    assert.equal(new Set(patterns).size, 3);
    for (const encounter of ENCOUNTERS) {
      assert.ok(encounter.pattern.length >= 3);
      assert.ok(
        encounter.pattern.some((move) => move !== "ATTACK"),
        "each pattern has a counterable beat",
      );
    }
  });

  it("resolves encounters by key and rejects unknown keys", () => {
    assert.equal(findEncounter("the-doubt").name, "The Doubt");
    assert.equal(findEncounter("the-dragon"), null);
  });
});

describe("boss rating bounds", () => {
  it("never scales below the chapter floor for a very weak player", () => {
    for (const encounter of ENCOUNTERS) {
      assert.equal(clampBossRating(0, encounter), encounter.minRating);
      assert.equal(clampBossRating(10, encounter), encounter.minRating);
    }
  });

  it("never scales above the chapter ceiling for a very strong player", () => {
    for (const encounter of ENCOUNTERS) {
      assert.equal(clampBossRating(100_000, encounter), encounter.maxRating);
    }
  });

  it("tracks the player inside the band with the chapter's margin", () => {
    const playerRating = 300;
    const rating = clampBossRating(playerRating, distraction);

    assert.equal(rating, Math.round(playerRating * 1.08));
    assert.ok(rating > playerRating, "slightly stronger inside the band");
  });

  it("stops being a treadmill: a strong player outgrows an early trial", () => {
    const weakPlayer = 200;
    const strongPlayer = 900;

    const weakBoss = clampBossRating(weakPlayer, doubt);
    const strongBoss = clampBossRating(strongPlayer, doubt);

    assert.ok(weakBoss > weakPlayer, "the first trial challenges a new player");
    assert.ok(strongBoss < strongPlayer, "the same trial is comfortably beaten later");
  });

  it("keeps chapters in ascending difficulty", () => {
    assert.ok(doubt.minRating < distraction.minRating);
    assert.ok(distraction.minRating < discouragement.minRating);
    assert.ok(doubt.margin < discouragement.margin);
  });
});

describe("scaleBoss", () => {
  it("produces a stat block close to the target rating", () => {
    for (const encounter of ENCOUNTERS) {
      const scaled = scaleBoss(400, encounter);
      const drift = Math.abs(scaled.rating - scaled.targetRating) / scaled.targetRating;

      assert.ok(drift < 0.05, `${encounter.key} lands within 5% of its target`);
    }
  });

  it("gives every boss a usable speed", () => {
    for (const encounter of ENCOUNTERS) {
      assert.ok(scaleBoss(0, encounter).stats.dexterity >= 1);
    }
  });

  it("respects the archetype: the distraction is the fastest of the three", () => {
    const speeds = ENCOUNTERS.map((e) => scaleBoss(500, e).stats.dexterity);

    assert.equal(Math.max(...speeds), speeds[1]);
  });

  it("is deterministic, so reopening an encounter cannot reroll an easier boss", () => {
    assert.deepEqual(scaleBoss(377, discouragement), scaleBoss(377, discouragement));
  });

  it("builds a snapshot whose derived values match its stats", () => {
    const snapshot = buildBossSnapshot(350, doubt);

    assert.deepEqual(snapshot.derived, getDerived(snapshot.stats));
    assert.equal(snapshot.rating, getCombatRating(snapshot.derived, 0));
    assert.deepEqual(snapshot.spellKeys, []);
  });
});

describe("getBossAction", () => {
  it("cycles the pattern so it can be learned and countered", () => {
    const pattern = ["ATTACK", "DEFEND"];

    assert.equal(getBossAction(pattern, 0), "ATTACK");
    assert.equal(getBossAction(pattern, 1), "DEFEND");
    assert.equal(getBossAction(pattern, 2), "ATTACK");
    assert.equal(getBossAction(pattern, 99), "DEFEND");
  });
});

describe("spell catalog", () => {
  it("ships at least six spells spanning damage, defence, healing and initiative", () => {
    const kinds = new Set(SPELL_CATALOG.map((spell) => spell.effect.type));

    assert.ok(SPELL_CATALOG.length >= 6);
    assert.ok(kinds.has("HEAL"));
    assert.ok(kinds.has("SHIELD"));
    assert.ok(kinds.has("DAMAGE"));
    assert.ok(kinds.has("SLOW"));
  });

  it("uses unique keys and ascending wisdom thresholds", () => {
    const keys = SPELL_CATALOG.map((spell) => spell.key);
    const thresholds = SPELL_CATALOG.map((spell) => spell.wisdomRequired);

    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b));
  });

  it("qualifies a spell only at or above its threshold", () => {
    const spell = findSpell("dawn-break");

    assert.equal(canUnlock(spell, 8), false);
    assert.equal(canUnlock(spell, 9), true);
    assert.equal(canUnlock(spell, 40), true);
  });

  it("rejects an unknown spell key", () => {
    assert.equal(isKnownSpell("fireball"), false);
    assert.equal(findSpell("fireball"), null);
    assert.equal(canUnlock(null, 999), false);
  });

  it("describes locked, available and unlocked states for the Explore page", () => {
    const described = describeCatalog({ wisdom: 3, unlockedKeys: ["steady-breath"] });
    const byKey = Object.fromEntries(described.map((spell) => [spell.key, spell]));

    assert.equal(byKey["steady-breath"].unlocked, true);
    assert.equal(byKey["steady-breath"].available, false);
    assert.equal(byKey["quiet-resolve"].available, true);
    assert.equal(byKey["dawn-break"].unlocked, false);
    assert.equal(byKey["dawn-break"].available, false);
    assert.equal(byKey["dawn-break"].wisdomRemaining, 6);
  });
});
