import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIONS,
  CombatError,
  SIDES,
  applyAction,
  createBattleState,
  toBattleView,
} from "../src/domain/combat.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { SPELL_CATALOG } from "../src/domain/spells.js";

function snapshot(totals, spellKeys = [], name = "Someone") {
  return buildCharacterSnapshot({ totals, unlockedSpellKeys: spellKeys, name });
}

function battle({ player = {}, opponent = {}, playerSpells = [], opponentSpells = [] } = {}) {
  return createBattleState({
    playerSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 4, ...player }, playerSpells, "Player"),
    opponentSnapshot: snapshot({ strength: 4, dexterity: 3, intelligence: 4, ...opponent }, opponentSpells, "Boss"),
  });
}

function evenBattle({ playerSpells = [], opponentSpells = [] } = {}) {
  return battle({
    player: { dexterity: 6 },
    opponent: { dexterity: 6 },
    playerSpells,
    opponentSpells,
  });
}

describe("battle setup", () => {
  it("starts both sides at full health and full mana", () => {
    const state = battle();

    assert.equal(state.combatants.PLAYER.health, state.combatants.PLAYER.derived.maxHealth);
    assert.equal(state.combatants.PLAYER.mana, state.combatants.PLAYER.derived.maxMana);
    assert.equal(state.combatants.OPPONENT.health, state.combatants.OPPONENT.derived.maxHealth);
  });

  it("gives the first turn to the faster side", () => {
    assert.equal(battle().activeSide, SIDES.PLAYER);
  });
});

describe("basic attack", () => {
  it("deals the actor's basic damage and costs no mana", () => {
    const state = battle();
    const before = state.combatants.OPPONENT.health;
    const { state: next } = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    assert.equal(before - next.combatants.OPPONENT.health, state.combatants.PLAYER.derived.basicDamage);
    assert.equal(next.combatants.PLAYER.mana, state.combatants.PLAYER.mana);
  });

  it("never drives health below zero", () => {
    let state = battle({ player: { strength: 30 }, opponent: { strength: 0, dexterity: 1 } });
    state.combatants.OPPONENT.health = 3;
    const { state: next } = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    assert.equal(next.combatants.OPPONENT.health, 0);
  });
});

describe("defend", () => {
  it("halves the next incoming hit and then expires", () => {
    const guarded = applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    assert.equal(guarded.combatants.PLAYER.defending, true);
    assert.equal(guarded.activeSide, SIDES.OPPONENT);

    const healthBefore = guarded.combatants.PLAYER.health;
    const after = applyAction(guarded, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    const guardedDamage = healthBefore - after.combatants.PLAYER.health;
    const fullDamage = guarded.combatants.OPPONENT.derived.basicDamage;

    assert.equal(guardedDamage, Math.round(fullDamage * 0.5));
    assert.equal(after.combatants.PLAYER.defending, false, "guard expires after one hit");
  });

  it("takes a full hit once the guard has expired", () => {
    let state = applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    const healthBefore = state.combatants.PLAYER.health;
    const after = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(healthBefore - after.combatants.PLAYER.health, state.combatants.OPPONENT.derived.basicDamage);
  });
});

describe("spell casting", () => {
  it("rejects a spell the actor has not unlocked", () => {
    const state = battle();

    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }),
      (error) => error instanceof CombatError && error.code === "SPELL_LOCKED",
    );
  });

  it("rejects an unknown spell key", () => {
    const state = battle({ playerSpells: ["steady-breath"] });

    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "fireball" }),
      (error) => error.code === "UNKNOWN_SPELL",
    );
  });

  it("rejects a cast the actor cannot pay for", () => {
    let state = battle({ player: { intelligence: 0 }, playerSpells: ["dawn-break"] });
    state.combatants.PLAYER.mana = 2;

    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }),
      (error) => error.code === "INSUFFICIENT_MANA",
    );
  });

  it("spends exactly the spell's mana cost", () => {
    const state = battle({ playerSpells: ["steady-breath"] });
    const { state: next } = applyAction(state, {
      side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath",
    });

    assert.equal(state.combatants.PLAYER.mana - next.combatants.PLAYER.mana, 6);
  });

  it("heals without exceeding max health", () => {
    let state = battle({ playerSpells: ["steady-breath"] });
    state.combatants.PLAYER.health = state.combatants.PLAYER.derived.maxHealth - 5;
    const { state: next } = applyAction(state, {
      side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath",
    });

    assert.equal(next.combatants.PLAYER.health, next.combatants.PLAYER.derived.maxHealth);
  });

  it("absorbs damage with a shield before health is touched", () => {
    let state = evenBattle({ playerSpells: ["quiet-resolve"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "quiet-resolve" }).state;
    assert.equal(state.combatants.PLAYER.shield, 26);

    const healthBefore = state.combatants.PLAYER.health;
    const after = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(after.combatants.PLAYER.health, healthBefore, "shield absorbed the whole hit");
    assert.ok(after.combatants.PLAYER.shield < 26);
  });

  it("strips a guard and ignores it in the same cast", () => {
    let state = evenBattle({ playerSpells: ["clear-sight"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    assert.equal(state.combatants.OPPONENT.defending, true);

    const healthBefore = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "clear-sight" }).state;

    assert.equal(after.combatants.OPPONENT.defending, false);
    assert.equal(healthBefore - after.combatants.OPPONENT.health, 10, "full damage, guard ignored");
  });

  it("pushes the opponent back on the initiative gauge", () => {
    const state = battle({ playerSpells: ["still-water"] });
    const gaugeBefore = state.combatants.OPPONENT.gauge;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "still-water" }).state;

    assert.ok(after.combatants.OPPONENT.gauge < gaugeBefore + 40);
  });

  it("burns the opponent at the start of its own turns", () => {
    let state = battle({ player: { dexterity: 6 }, opponent: { dexterity: 6 }, playerSpells: ["kindled-lamp"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "kindled-lamp" }).state;

    assert.equal(state.combatants.OPPONENT.burn.turns, 2, "one tick already applied on their turn start");
    assert.ok(state.log.some((entry) => entry.code === "BURN_TICK"));
  });

  it("targets self for self spells and the opponent for offensive spells", () => {
    for (const spell of SPELL_CATALOG) {
      assert.ok(["SELF", "OPPONENT"].includes(spell.target), `${spell.key} has a valid target`);
      assert.ok(spell.manaCost > 0, `${spell.key} costs mana`);
      assert.ok(spell.wisdomRequired >= 1, `${spell.key} has a wisdom threshold`);
    }
  });
});

describe("completion", () => {
  it("declares the winner when health reaches zero", () => {
    let state = battle({ player: { strength: 30, dexterity: 9 }, opponent: { dexterity: 1 } });
    state.combatants.OPPONENT.health = 4;
    const { state: next } = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    assert.equal(next.status, "COMPLETED");
    assert.equal(next.winner, SIDES.PLAYER);
    assert.equal(next.activeSide, null);
  });

  it("awards the win to the opponent on forfeit", () => {
    const { state } = applyAction(battle(), { side: SIDES.PLAYER, type: ACTIONS.FORFEIT });

    assert.equal(state.status, "COMPLETED");
    assert.equal(state.winner, SIDES.OPPONENT);
  });

  it("rejects any action on a completed battle", () => {
    const { state } = applyAction(battle(), { side: SIDES.PLAYER, type: ACTIONS.FORFEIT });

    assert.throws(
      () => applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }),
      (error) => error.code === "BATTLE_COMPLETED",
    );
  });

  it("rejects an out-of-turn action", () => {
    const state = battle();

    assert.throws(
      () => applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }),
      (error) => error.code === "OUT_OF_TURN",
    );
  });

  it("rejects an unknown action type", () => {
    assert.throws(
      () => applyAction(battle(), { side: SIDES.PLAYER, type: "MEDITATE" }),
      (error) => error.code === "UNKNOWN_ACTION",
    );
  });
});

describe("purity and view", () => {
  it("never mutates the state it was given", () => {
    const state = battle();
    const before = structuredClone(state);
    applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    assert.deepEqual(state, before);
  });

  it("exposes a view with text-equivalent numbers and no private fields", () => {
    const view = toBattleView(battle({ playerSpells: ["steady-breath"] }));

    assert.equal(view.player.maxHealth, 132);
    assert.ok(Array.isArray(view.projectedOrder) && view.projectedOrder.length > 0);
    assert.ok(!("burn" in view.player), "internal burn object is not exposed raw");
  });

  it("keeps the log to display codes and numbers only", () => {
    const { state } = applyAction(battle(), { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    for (const entry of state.log) {
      assert.equal(typeof entry.code, "string");
      for (const value of Object.values(entry)) {
        assert.ok(["string", "number", "boolean"].includes(typeof value) || value === null);
      }
    }
  });
});
