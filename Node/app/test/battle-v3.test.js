import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIONS,
  SIDES,
  applyAction,
  createBattleState,
  getFormulaVersion,
  supportsResolve,
  supportsTactics,
  toBattleView,
} from "../src/domain/combat.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { COMBAT, FORMULA_VERSIONS } from "../src/domain/constants.js";

function snapshot(totals, spellKeys = [], name = "Someone") {
  return buildCharacterSnapshot({ totals, unlockedSpellKeys: spellKeys, name });
}

function v3Battle({ player = {}, opponent = {}, playerSpells = [], opponentSpells = [] } = {}) {
  const state = createBattleState({
    playerSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 4, ...player }, playerSpells, "Player"),
    opponentSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 4, ...opponent }, opponentSpells, "Boss"),
  });
  state.formulaVersion = FORMULA_VERSIONS.TACTICS;

  return state;
}

describe("formula version 3", () => {
  it("names version 3 in the version set", () => {
    assert.equal(FORMULA_VERSIONS.TACTICS, 3);
  });

  it("recognises a version 3 state as supporting tactics, and older ones as not", () => {
    const v3 = v3Battle();

    assert.equal(getFormulaVersion(v3), 3);
    assert.equal(supportsTactics(v3), true);
    assert.equal(supportsResolve(v3), true, "version 3 is a superset of version 2");

    const v2 = { ...v3, formulaVersion: 2 };
    assert.equal(supportsTactics(v2), false);

    const v1 = { ...v3, formulaVersion: 1 };
    assert.equal(supportsTactics(v1), false);

    assert.equal(supportsTactics({}), false, "a state with no version is version 1");
  });

  it("offers the same action list as version 2 - depth comes from the rules, not new buttons", () => {
    assert.deepEqual(
      toBattleView(v3Battle()).supportedActions,
      ["ATTACK", "DEFEND", "CAST", "FORFEIT", "BREAK", "SURGE"],
    );
  });

  it("publishes its version to the browser", () => {
    assert.equal(toBattleView(v3Battle()).formulaVersion, 3);
  });

  it("carries the V3 tunables in constants rather than scattered literals", () => {
    assert.equal(COMBAT.EXPOSED_MULTIPLIER, 1.25);
    assert.equal(COMBAT.RIPOSTE_MULTIPLIER, 1.3);
    assert.equal(COMBAT.SHIELD_CAP_RATIO, 0.35);
  });

  it("still resolves an ordinary exchange", () => {
    let state = v3Battle();
    const before = state.combatants.OPPONENT.health;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    assert.equal(before - state.combatants.OPPONENT.health, state.combatants.PLAYER.derived.basicDamage);
  });
});

describe("riposte", () => {
  function afterAbsorbedGuard(options) {
    let state = v3Battle(options);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    return state;
  }

  it("is granted only when a guard actually absorbs a hit", () => {
    const raised = applyAction(v3Battle(), { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    assert.equal(raised.combatants.PLAYER.statuses?.RIPOSTE, undefined, "a guard alone earns nothing");

    const absorbed = afterAbsorbedGuard();
    assert.equal(absorbed.combatants.PLAYER.statuses.RIPOSTE.charges, 1);
  });

  it("is granted in addition to the existing Resolve reward, not instead of it", () => {
    const absorbed = afterAbsorbedGuard();

    assert.equal(absorbed.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_GUARD_ABSORB);
    assert.equal(absorbed.combatants.PLAYER.statuses.RIPOSTE.charges, 1);
  });

  it("multiplies the defender's next basic Attack and is consumed by it", () => {
    const armed = afterAbsorbedGuard();
    const plain = v3Battle();

    const damage = (state) => {
      const before = state.combatants.OPPONENT.health;
      const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
      return { dealt: before - after.combatants.OPPONENT.health, state: after };
    };

    const baseline = damage(plain).dealt;
    const riposted = damage(armed);

    assert.equal(riposted.dealt, Math.round(baseline * COMBAT.RIPOSTE_MULTIPLIER));
    assert.equal(riposted.state.combatants.PLAYER.statuses?.RIPOSTE, undefined, "one charge, spent once");
  });

  it("is not consumed by Break, Surge or a spell", () => {
    for (const type of [ACTIONS.BREAK, ACTIONS.SURGE]) {
      const armed = afterAbsorbedGuard();
      armed.combatants.PLAYER.resolve = COMBAT.RESOLVE_MAX;

      const after = applyAction(armed, { side: SIDES.PLAYER, type }).state;
      assert.equal(after.combatants.PLAYER.statuses.RIPOSTE.charges, 1, `${type} left Riposte alone`);
    }

    const armedCaster = afterAbsorbedGuard({ playerSpells: ["dawn-break"], player: { intelligence: 10 } });
    const cast = applyAction(armedCaster, {
      side: SIDES.PLAYER,
      type: ACTIONS.CAST,
      spellKey: "dawn-break",
    }).state;

    assert.equal(cast.combatants.PLAYER.statuses.RIPOSTE.charges, 1, "a spell left Riposte alone");
  });

  it("refreshes rather than stacks when a second guard absorbs a hit", () => {
    let state = afterAbsorbedGuard();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(state.combatants.PLAYER.statuses.RIPOSTE.charges, 1, "never more than one charge");
  });

  it("logs the application, the consumption and the bonus it paid", () => {
    const armed = afterAbsorbedGuard();
    const applied = armed.log.filter((entry) => entry.code === "STATUS_APPLIED" && entry.key === "RIPOSTE");
    assert.equal(applied.length, 1);
    assert.equal(applied[0].side, SIDES.PLAYER);

    const result = applyAction(armed, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });
    const consumed = result.entries.filter((entry) => entry.code === "STATUS_CONSUMED" && entry.key === "RIPOSTE");
    const bonus = result.entries.filter((entry) => entry.code === "STATUS_BONUS" && entry.key === "RIPOSTE");

    assert.equal(consumed.length, 1);
    assert.equal(bonus.length, 1);
    assert.ok(bonus[0].amount > 0, "the bonus damage is reported as a number");
  });

  it("never appears in a version 2 battle", () => {
    let state = v3Battle();
    state.formulaVersion = 2;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(state.combatants.PLAYER.statuses, undefined);
    assert.ok(!state.log.some((entry) => entry.code === "STATUS_APPLIED"));
  });
});

describe("exposed", () => {
  function afterSuccessfulBreak(options) {
    let state = v3Battle(options);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    return state;
  }

  it("is applied only by a Break that actually found a guard", () => {
    const opened = afterSuccessfulBreak();
    assert.equal(opened.combatants.OPPONENT.statuses.EXPOSED.charges, 1);

    let missed = v3Battle();
    missed = applyAction(missed, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;
    assert.equal(missed.combatants.OPPONENT.statuses?.EXPOSED, undefined, "an early Break opens nothing");
  });

  it("applies after the Break's own hit, which keeps its full 125% value", () => {
    let guarded = v3Battle();
    guarded = applyAction(guarded, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    guarded = applyAction(guarded, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;

    const before = guarded.combatants.OPPONENT.health;
    const broken = applyAction(guarded, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;
    const dealt = before - broken.combatants.OPPONENT.health;

    assert.equal(
      dealt,
      Math.round(guarded.combatants.PLAYER.derived.basicDamage * COMBAT.BREAK_GUARDED_MULTIPLIER),
      "the Break that creates Exposed is not also boosted by it",
    );
  });

  it("multiplies the next direct hit against that target and is consumed by it", () => {
    const opened = afterSuccessfulBreak();
    const damageOf = (state, type) => {
      const before = state.combatants.OPPONENT.health;
      const after = applyAction(state, { side: SIDES.PLAYER, type }).state;
      return { dealt: before - after.combatants.OPPONENT.health, state: after };
    };

    let control = v3Battle();
    control = applyAction(control, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    control = applyAction(control, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    control = applyAction(control, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    control = applyAction(control, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    let opponentTurn = applyAction(opened, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    const baseline = damageOf(control, ACTIONS.ATTACK).dealt;
    const boosted = damageOf(opponentTurn, ACTIONS.ATTACK);

    assert.equal(boosted.dealt, Math.round(baseline * COMBAT.EXPOSED_MULTIPLIER));
    assert.equal(boosted.state.combatants.OPPONENT.statuses?.EXPOSED, undefined, "one charge, spent once");
  });

  it("is consumed by Surge and by a direct-damage spell as well as by Attack", () => {
    const surging = afterSuccessfulBreak();
    surging.combatants.PLAYER.resolve = COMBAT.RESOLVE_MAX;
    let turn = applyAction(surging, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    turn = applyAction(turn, { side: SIDES.PLAYER, type: ACTIONS.SURGE }).state;
    assert.equal(turn.combatants.OPPONENT.statuses?.EXPOSED, undefined, "Surge spent it");

    const casting = afterSuccessfulBreak({ playerSpells: ["dawn-break"], player: { intelligence: 12 } });
    let castTurn = applyAction(casting, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    castTurn = applyAction(castTurn, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }).state;
    assert.equal(castTurn.combatants.OPPONENT.statuses?.EXPOSED, undefined, "a direct-damage spell spent it");
  });

  it("is never consumed by a lingering burn tick", () => {
    const opened = afterSuccessfulBreak({ playerSpells: ["kindled-lamp"], player: { intelligence: 12 } });
    opened.combatants.OPPONENT.burn = { damage: 5, turns: 3 };

    let ticked = applyAction(opened, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    ticked = applyAction(ticked, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;

    assert.ok(ticked.log.some((entry) => entry.code === "BURN_TICK"), "the burn did tick");
    assert.equal(ticked.combatants.OPPONENT.statuses.EXPOSED.charges, 1, "burn left the charge alone");
  });

  it("refreshes rather than stacks on a second successful Break", () => {
    let state = afterSuccessfulBreak();
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.equal(state.combatants.OPPONENT.statuses.EXPOSED.charges, 1);
  });

  it("logs application, consumption and the bonus damage it paid", () => {
    const opened = afterSuccessfulBreak();
    assert.equal(
      opened.log.filter((entry) => entry.code === "STATUS_APPLIED" && entry.key === "EXPOSED").length,
      1,
    );

    const turn = applyAction(opened, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    const result = applyAction(turn, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });

    assert.equal(result.entries.filter((e) => e.code === "STATUS_CONSUMED" && e.key === "EXPOSED").length, 1);
    const bonus = result.entries.filter((e) => e.code === "STATUS_BONUS" && e.key === "EXPOSED");
    assert.equal(bonus.length, 1);
    assert.ok(bonus[0].amount > 0);
  });

  it("never appears in a version 2 battle", () => {
    let state = v3Battle();
    state.formulaVersion = 2;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.equal(state.combatants.OPPONENT.statuses, undefined);
  });
});

describe("shield and burn under version 3", () => {
  it("caps a shield at 35% of the receiver's own maximum health", () => {
    const state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["quiet-resolve"] });
    const cap = Math.round(state.combatants.PLAYER.derived.maxHealth * COMBAT.SHIELD_CAP_RATIO);

    const shielded = applyAction(state, {
      side: SIDES.PLAYER,
      type: ACTIONS.CAST,
      spellKey: "quiet-resolve",
    }).state;

    assert.ok(cap < 50, "the fixture really does exceed the cap");
    assert.equal(shielded.combatants.PLAYER.shield, cap);
  });

  it("reports the cap it applied so the arena can explain the shortfall", () => {
    let state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["quiet-resolve"] });
    state.combatants.PLAYER.shield = Math.round(state.combatants.PLAYER.derived.maxHealth * COMBAT.SHIELD_CAP_RATIO);

    const result = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "quiet-resolve" });
    const shieldEntry = result.entries.find((entry) => entry.code === "SHIELD");

    assert.ok(shieldEntry, "a shield entry is still logged");
    assert.equal(shieldEntry.capped, true);
  });

  it("keeps the stronger per-turn burn and refreshes duration, never two ticks", () => {
    const state = v3Battle({ player: { intelligence: 10 }, playerSpells: ["kindled-lamp"] });
    const first = { damage: 5 + 10 * 1, turns: 3 };

    state.combatants.OPPONENT.burn = { damage: first.damage + 5, turns: 1 };

    const result = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "kindled-lamp" });
    const applied = result.entries.find((entry) => entry.code === "BURN_APPLIED");

    assert.equal(applied.amount, first.damage + 5, "the stronger tick was kept");
    assert.equal(applied.turns, 3, "duration refreshed to the catalog maximum");
    assert.equal(
      typeof result.state.combatants.OPPONENT.burn.turns,
      "number",
      "one burn object, never a second independent one",
    );
  });

  it("never refreshes a burn beyond the catalog duration", () => {
    let state = v3Battle({ player: { intelligence: 10 }, playerSpells: ["kindled-lamp"] });
    state.combatants.OPPONENT.burn = { damage: 1, turns: 9 };

    const applied = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "kindled-lamp" })
      .entries.find((entry) => entry.code === "BURN_APPLIED");

    assert.equal(applied.turns, 9, "a longer burn is left alone rather than shortened");
  });

  it("leaves the version 2 shield and burn rules exactly as they were", () => {
    let state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["quiet-resolve"] });
    state.formulaVersion = 2;
    state.combatants.PLAYER.shield = 500;

    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "quiet-resolve" }).state;

    assert.equal(after.combatants.PLAYER.shield, 526, "version 2 still stacks without a cap");
  });
});

describe("spell cooldowns", () => {
  function caster(spellKeys, extra = {}) {
    return v3Battle({ player: { intelligence: 14, ...extra }, playerSpells: spellKeys });
  }

  it("makes a cast spell unavailable for exactly the owner's next N decisions", () => {
    let state = caster(["steady-breath"]);
    const cast = () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" });

    state = cast().state;
    assert.equal(state.combatants.PLAYER.cooldowns["steady-breath"], 2);

    for (const decision of [1, 2]) {
      state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
      assert.throws(cast, (error) => error.code === "SPELL_ON_COOLDOWN", `decision ${decision} still blocked`);
      state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    }

    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    assert.equal(state.combatants.PLAYER.cooldowns?.["steady-breath"] ?? 0, 0, "available again");
    assert.doesNotThrow(cast);
  });

  it("changes no state at all when the cast is refused", () => {
    let state = caster(["steady-breath"]);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;

    const before = structuredClone(state);
    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }),
      (error) => error.code === "SPELL_ON_COOLDOWN",
    );

    assert.deepEqual(state, before, "a refused cast left the state untouched");
  });

  it("counts the owner's own decisions, not global turns or the opponent's", () => {
    let state = v3Battle({
      player: { dexterity: 30, intelligence: 14 },
      opponent: { dexterity: 1 },
      playerSpells: ["steady-breath"],
    });

    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }).state;
    assert.equal(state.combatants.PLAYER.cooldowns["steady-breath"], 2);

    assert.equal(state.activeSide, SIDES.PLAYER, "the fast side keeps the turn");
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    assert.equal(state.combatants.PLAYER.cooldowns["steady-breath"], 1);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    assert.equal(state.combatants.PLAYER.cooldowns?.["steady-breath"] ?? 0, 0);
  });

  it("never lets an opponent's turns cool the player's spell", () => {
    let state = caster(["steady-breath"]);
    state.combatants.PLAYER.derived.speed = 1;
    state.combatants.OPPONENT.derived.speed = 30;

    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }).state;

    for (let turn = 0; turn < 4 && state.activeSide === SIDES.OPPONENT; turn += 1) {
      state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    }

    assert.equal(
      state.combatants.PLAYER.cooldowns["steady-breath"],
      2,
      "four opponent turns cooled nothing",
    );
  });

  it("tracks each spell's own cooldown independently", () => {
    let state = caster(["steady-breath", "clear-sight"]);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;

    assert.doesNotThrow(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "clear-sight" }),
      "a different spell is unaffected",
    );
  });

  it("does not exist in a version 2 battle", () => {
    let state = caster(["steady-breath"]);
    state.formulaVersion = 2;

    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;

    assert.equal(state.combatants.PLAYER.cooldowns, undefined);
    assert.doesNotThrow(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "steady-breath" }),
      "version 2 may still spam an affordable spell",
    );
  });
});

describe("spell scaling", () => {
  it("reproduces the shipped version 2 numbers exactly at Intelligence 4", () => {
    const state = v3Battle({ player: { intelligence: 4 }, playerSpells: ["dawn-break"] });
    state.combatants.PLAYER.mana = 99;

    const before = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }).state;

    assert.equal(before - after.combatants.OPPONENT.health, 38, "the catalog's own fixed value");
  });

  it("scales with the frozen snapshot's Intelligence, not with live progression", () => {
    const smart = v3Battle({ player: { intelligence: 12 }, playerSpells: ["dawn-break"] });
    smart.combatants.PLAYER.mana = 99;

    const before = smart.combatants.OPPONENT.health;
    const after = applyAction(smart, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }).state;
    const dealt = before - after.combatants.OPPONENT.health;

    assert.ok(dealt > 38, `a smarter caster hits harder (${dealt})`);
    assert.equal(dealt, 22 + 12 * 4, "base plus the frozen-stat coefficient");
  });

  it("keeps the exact fixed values in a version 2 battle", () => {
    const state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["dawn-break"] });
    state.formulaVersion = 2;
    state.combatants.PLAYER.mana = 99;

    const before = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }).state;

    assert.equal(before - after.combatants.OPPONENT.health, 38, "version 2 never scales");
  });

  it("gives every catalog spell a cooldown and a scaling rule", async () => {
    const { SPELL_CATALOG } = await import("../src/domain/spells.js");

    for (const spell of SPELL_CATALOG) {
      assert.equal(typeof spell.cooldownTurns, "number", `${spell.key} declares a cooldown`);
      assert.ok(spell.cooldownTurns >= 1, `${spell.key} cooldown is at least one decision`);
      assert.ok(spell.scaling && Object.keys(spell.scaling).length > 0, `${spell.key} declares scaling`);
      assert.ok(spell.power >= 1, `${spell.key} declares its rating power`);
    }
  });
});

describe("the battle the browser is given under version 3", () => {
  it("publishes safe status descriptors in one deterministic order", () => {
    let state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["quiet-resolve"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "quiet-resolve" }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    state.combatants.PLAYER.burn = { damage: 4, turns: 2 };

    const view = toBattleView(state).player;
    const keys = view.statuses.map((status) => status.key);

    assert.deepEqual(keys, ["SHIELD", "BURN", "RIPOSTE"], "one order, never object key order");

    for (const status of view.statuses) {
      assert.equal(typeof status.label, "string");
      assert.equal(typeof status.icon, "string");
      for (const value of Object.values(status)) {
        assert.ok(["string", "number"].includes(typeof value), "no rules, no objects, no functions");
      }
    }
  });

  it("shows a guard and the two charges as words, not just as flags", () => {
    let state = v3Battle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    const labels = toBattleView(state).player.statuses.map((status) => status.label);

    assert.ok(labels.includes("Riposte"));
  });

  it("publishes no charge statuses at all for a version 2 battle", () => {
    let state = v3Battle();
    state.formulaVersion = 2;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    const keys = toBattleView(state).player.statuses.map((status) => status.key);

    assert.ok(!keys.includes("RIPOSTE"));
    assert.ok(!keys.includes("EXPOSED"));
  });

  it("resolves each equipped spell server-side: preview, cost, cooldown and reason", () => {
    const state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["dawn-break", "steady-breath"] });
    const spells = toBattleView(state).player.spells;

    assert.equal(spells.length, 2, "only the equipped entries");

    const dawn = spells.find((spell) => spell.key === "dawn-break");
    assert.equal(dawn.name, "Dawn Break");
    assert.equal(dawn.manaCost, 16);
    assert.equal(dawn.cooldownTurns, 2);
    assert.equal(dawn.cooldownRemaining, 0);
    assert.equal(dawn.available, true);
    assert.equal(dawn.reason, null);
    assert.equal(dawn.preview, `Deals ${22 + 12 * 4} damage.`, "the number is true for this snapshot");
  });

  it("says in words why an unavailable spell is unavailable", () => {
    let state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["dawn-break", "steady-breath"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.CAST, spellKey: "dawn-break" }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;

    const spells = toBattleView(state).player.spells;
    const dawn = spells.find((spell) => spell.key === "dawn-break");

    assert.equal(dawn.available, false);
    assert.equal(dawn.cooldownRemaining, 2);
    assert.equal(dawn.reason, "2 turns");

    const poor = v3Battle({ player: { intelligence: 0 }, playerSpells: ["dawn-break"] });
    poor.combatants.PLAYER.mana = 3;
    const blocked = toBattleView(poor).player.spells[0];

    assert.equal(blocked.available, false);
    assert.equal(blocked.reason, "Needs 16 mana");
  });

  it("never sends a spell's rule, scaling or catalog formula to the browser", () => {
    const state = v3Battle({ player: { intelligence: 12 }, playerSpells: ["dawn-break"] });
    const spell = toBattleView(state).player.spells[0];

    assert.deepEqual(
      Object.keys(spell).sort(),
      ["available", "cooldownRemaining", "cooldownTurns", "key", "manaCost", "name", "preview", "reason", "target"],
    );
    assert.equal(JSON.stringify(spell).includes("scaling"), false);
    assert.equal(JSON.stringify(spell).includes("base"), false);
  });

  it("keeps a version 2 battle's spell list working exactly as before", () => {
    const state = v3Battle({ playerSpells: ["dawn-break"] });
    state.formulaVersion = 2;
    const view = toBattleView(state).player;

    assert.deepEqual(view.spellKeys, ["dawn-break"], "the old field is still there");
    assert.equal(view.spells[0].cooldownTurns, null, "version 2 has no cooldowns to publish");
    assert.equal(view.spells[0].preview, "Deals 38 damage.", "the fixed catalog value");
  });
});

describe("charge bonuses are reported per charge", () => {
  it("attributes a bonus to each charge that paid, when a hit carries both", () => {
    let state = v3Battle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(state.combatants.PLAYER.statuses.RIPOSTE.charges, 1);
    state.combatants.OPPONENT.statuses = { EXPOSED: { key: "EXPOSED", charges: 1 } };

    const result = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK });
    const bonuses = result.entries.filter((entry) => entry.code === "STATUS_BONUS");

    assert.deepEqual(
      bonuses.map((entry) => entry.key).sort(),
      ["EXPOSED", "RIPOSTE"],
      "both charges report their own bonus",
    );
    for (const bonus of bonuses) assert.ok(bonus.amount > 0);

    const base = state.combatants.PLAYER.derived.basicDamage;
    const dealt = result.entries.find((entry) => entry.code === "ATTACK").amount;
    assert.equal(dealt, Math.round(base * COMBAT.RIPOSTE_MULTIPLIER * COMBAT.EXPOSED_MULTIPLIER));
  });
});
