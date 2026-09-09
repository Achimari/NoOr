import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIONS,
  SIDES,
  applyAction,
  createBattleState,
  getFormulaVersion,
  supportsResolve,
  toBattleView,
} from "../src/domain/combat.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { COMBAT, FORMULA_VERSION, FORMULA_VERSIONS } from "../src/domain/constants.js";
import { ENCOUNTERS, getBossIntent, runBossTurns } from "../src/domain/bosses.js";
import { toClientBattle } from "../src/domain/battleDto.js";
import { battleActionSchema } from "../src/validators/battleValidators.js";

function snapshot(totals, spellKeys = [], name = "Someone") {
  return buildCharacterSnapshot({ totals, unlockedSpellKeys: spellKeys, name });
}

function evenBattle({ player = {}, opponent = {}, playerSpells = [], opponentSpells = [] } = {}) {
  return createBattleState({
    playerSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 4, ...player }, playerSpells, "Player"),
    opponentSnapshot: snapshot({ strength: 4, dexterity: 6, intelligence: 4, ...opponent }, opponentSpells, "Boss"),
  });
}

describe("resolve", () => {
  it("starts every combatant at zero under the current formula version", () => {
    const state = evenBattle();

    assert.equal(state.formulaVersion, FORMULA_VERSION);
    assert.equal(state.combatants.PLAYER.resolve, 0);
    assert.equal(state.combatants.OPPONENT.resolve, 0);
  });

  it("is published to the browser for both sides with its ceiling", () => {
    const view = toBattleView(evenBattle());

    assert.equal(view.player.resolve, 0);
    assert.equal(view.opponent.resolve, 0);
    assert.equal(view.player.maxResolve, COMBAT.RESOLVE_MAX);
  });

  it("never exceeds its ceiling however long the battle runs", () => {
    let state = evenBattle({ player: { strength: 0 }, opponent: { strength: 0 } });

    for (let turn = 0; turn < 12 && state.status === "ACTIVE"; turn += 1) {
      state = applyAction(state, { side: state.activeSide, type: ACTIONS.ATTACK }).state;
    }

    assert.equal(state.combatants.PLAYER.resolve, COMBAT.RESOLVE_MAX);
    assert.ok(state.combatants.OPPONENT.resolve <= COMBAT.RESOLVE_MAX);
  });

  it("is granted by a basic attack", () => {
    const state = evenBattle();
    const next = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    assert.equal(next.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_ATTACK);
    assert.equal(next.combatants.OPPONENT.resolve, 0, "the target gains nothing from being hit");
  });
});

describe("defend", () => {
  it("grants Resolve only when the guard actually absorbs a hit", () => {
    let state = evenBattle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;

    assert.equal(state.combatants.PLAYER.resolve, 0, "raising a guard pays nothing by itself");

    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;

    assert.equal(state.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_GUARD_ABSORB);
  });

  it("pays nothing for defending over and over without being attacked", () => {
    let state = evenBattle();

    for (let turn = 0; turn < 6; turn += 1) {
      state = applyAction(state, { side: state.activeSide, type: ACTIONS.DEFEND }).state;
    }

    assert.equal(state.combatants.PLAYER.resolve, 0);
    assert.equal(state.combatants.OPPONENT.resolve, 0);
  });

  it("does not stack: a second guard is still one halved hit", () => {
    let state = evenBattle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;

    assert.equal(state.combatants.PLAYER.defending, true);

    const healthBefore = state.combatants.PLAYER.health;
    const after = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.ATTACK }).state;
    const damage = healthBefore - after.combatants.PLAYER.health;

    assert.equal(damage, Math.round(state.combatants.OPPONENT.derived.basicDamage * COMBAT.DEFEND_REDUCTION));
    assert.equal(after.combatants.PLAYER.defending, false, "one guard, one hit");
    assert.equal(after.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_GUARD_ABSORB, "paid once, not twice");
  });
});

describe("break", () => {
  it("removes a guard before it can absorb and hits for 125%", () => {
    let state = evenBattle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    assert.equal(state.combatants.OPPONENT.defending, true);

    const damage = state.combatants.PLAYER.derived.basicDamage;
    const healthBefore = state.combatants.OPPONENT.health;
    const resolveBefore = state.combatants.OPPONENT.resolve;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.equal(after.combatants.OPPONENT.defending, false);
    assert.equal(
      healthBefore - after.combatants.OPPONENT.health,
      Math.round(damage * COMBAT.BREAK_GUARDED_MULTIPLIER),
    );
    assert.equal(after.combatants.OPPONENT.resolve, resolveBefore, "a broken guard absorbed nothing, so it pays nothing");
  });

  it("is a poor opening move against someone who is not guarding", () => {
    const state = evenBattle();
    const damage = state.combatants.PLAYER.derived.basicDamage;
    const healthBefore = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.equal(
      healthBefore - after.combatants.OPPONENT.health,
      Math.round(damage * COMBAT.BREAK_UNGUARDED_MULTIPLIER),
    );
  });

  it("banks Resolve for the actor whether or not a guard was there", () => {
    const unguarded = applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;
    assert.equal(unguarded.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_BREAK);

    let state = applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    const guarded = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.equal(guarded.combatants.PLAYER.resolve, COMBAT.RESOLVE_ON_ATTACK + COMBAT.RESOLVE_ON_BREAK);
  });

  it("still goes through a shield rather than around it", () => {
    let state = evenBattle({ opponentSpells: ["quiet-resolve"] });
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.CAST, spellKey: "quiet-resolve" }).state;

    const shieldBefore = state.combatants.OPPONENT.shield;
    const healthBefore = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.BREAK }).state;

    assert.ok(shieldBefore > 0);
    assert.equal(after.combatants.OPPONENT.health, healthBefore, "the shield took it, not the health");
    assert.ok(after.combatants.OPPONENT.shield < shieldBefore);
  });

  it("writes a log entry the browser can explain", () => {
    const { entries } = applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.BREAK });
    const broke = entries.find((entry) => entry.code === "BREAK");

    assert.ok(broke);
    assert.equal(broke.guardBroken, false);
  });
});

describe("surge", () => {
  function banked({ closingMove = ACTIONS.ATTACK } = {}) {
    let state = evenBattle();
    const moves = [
      [SIDES.PLAYER, ACTIONS.ATTACK],
      [SIDES.OPPONENT, ACTIONS.ATTACK],
      [SIDES.PLAYER, ACTIONS.ATTACK],
      [SIDES.OPPONENT, ACTIONS.ATTACK],
      [SIDES.PLAYER, ACTIONS.ATTACK],
      [SIDES.OPPONENT, closingMove],
    ];

    for (const [side, type] of moves) {
      state = applyAction(state, { side, type }).state;
    }

    return state;
  }

  it("is refused below its cost, and the refusal names the resource", () => {
    const state = evenBattle();

    assert.equal(state.combatants.PLAYER.resolve, 0);
    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.SURGE }),
      (error) => error.code === "INSUFFICIENT_RESOLVE",
    );
  });

  it("is still refused one point short", () => {
    const state = evenBattle();
    state.combatants.PLAYER.resolve = COMBAT.SURGE_COST - 1;

    assert.throws(
      () => applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.SURGE }),
      (error) => error.code === "INSUFFICIENT_RESOLVE",
    );
  });

  it("spends exactly its cost and deals 175% of a basic attack", () => {
    const state = banked();
    assert.equal(state.combatants.PLAYER.resolve, COMBAT.SURGE_COST);

    const healthBefore = state.combatants.OPPONENT.health;
    const damage = state.combatants.PLAYER.derived.basicDamage;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.SURGE }).state;

    assert.equal(after.combatants.PLAYER.resolve, 0);
    assert.equal(
      healthBefore - after.combatants.OPPONENT.health,
      Math.round(damage * COMBAT.SURGE_MULTIPLIER),
    );
  });

  it("can be seen coming and answered with a guard", () => {
    const state = banked({ closingMove: ACTIONS.DEFEND });
    assert.equal(state.combatants.OPPONENT.defending, true);

    const healthBefore = state.combatants.OPPONENT.health;
    const resolveBefore = state.combatants.OPPONENT.resolve;
    const damage = state.combatants.PLAYER.derived.basicDamage;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.SURGE }).state;
    const full = Math.round(damage * COMBAT.SURGE_MULTIPLIER);

    assert.equal(
      healthBefore - after.combatants.OPPONENT.health,
      Math.round(full * COMBAT.DEFEND_REDUCTION),
    );
    assert.equal(
      after.combatants.OPPONENT.resolve - resolveBefore,
      COMBAT.RESOLVE_ON_GUARD_ABSORB,
      "reading the Surge paid for the guard",
    );
  });

  it("does not go around a shield", () => {
    const state = banked();
    state.combatants.OPPONENT.shield = 500;
    const healthBefore = state.combatants.OPPONENT.health;
    const after = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.SURGE }).state;

    assert.equal(after.combatants.OPPONENT.health, healthBefore);
    assert.ok(after.combatants.OPPONENT.shield < 500);
  });

  it("logs the spend so the browser can explain where the Resolve went", () => {
    const { entries } = applyAction(banked(), { side: SIDES.PLAYER, type: ACTIONS.SURGE });
    const spend = entries.find((entry) => entry.code === "RESOLVE_SPEND");

    assert.equal(spend.amount, COMBAT.SURGE_COST);
    assert.equal(spend.resolve, 0);
    assert.ok(entries.some((entry) => entry.code === "SURGE"));
  });
});

describe("formula version compatibility", () => {
  function v1Battle() {
    const state = structuredClone(evenBattle());
    state.formulaVersion = 1;
    delete state.combatants.PLAYER.resolve;
    delete state.combatants.OPPONENT.resolve;

    return state;
  }

  it("treats a state with no version at all as version 1", () => {
    const state = v1Battle();
    delete state.formulaVersion;

    assert.equal(getFormulaVersion(state), 1);
    assert.equal(supportsResolve(state), false);
  });

  it("still resolves an in-flight version 1 battle to the end", () => {
    let state = v1Battle();
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    assert.equal(state.status, "ACTIVE");
    assert.equal(state.formulaVersion, 1, "the battle keeps the rules it began with");

    const forfeited = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.FORFEIT }).state;
    assert.equal(forfeited.status, "COMPLETED");
    assert.equal(forfeited.winner, SIDES.PLAYER);
  });

  it("refuses the version 2 actions rather than resolving them under new rules", () => {
    for (const type of [ACTIONS.BREAK, ACTIONS.SURGE]) {
      assert.throws(
        () => applyAction(v1Battle(), { side: SIDES.PLAYER, type }),
        (error) => error.code === "UNSUPPORTED_ACTION",
        `${type} is refused on a version 1 battle`,
      );
    }
  });

  it("grants no Resolve at all inside a version 1 battle", () => {
    let state = applyAction(v1Battle(), { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    state = applyAction(state, { side: SIDES.OPPONENT, type: ACTIONS.DEFEND }).state;
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    assert.equal(state.combatants.PLAYER.resolve, undefined);
    assert.equal(state.combatants.OPPONENT.resolve, undefined);
    assert.ok(!state.log.some((entry) => entry.code === "RESOLVE_GAIN"));
  });

  it("tells the browser which actions the battle supports", () => {
    const legacy = toBattleView(v1Battle());
    assert.deepEqual(legacy.supportedActions, ["ATTACK", "DEFEND", "CAST", "FORFEIT"]);
    assert.equal(legacy.player.resolve, null);
    assert.equal(legacy.surgeCost, null);

    const current = toBattleView(evenBattle());
    assert.ok(current.supportedActions.includes("BREAK"));
    assert.ok(current.supportedActions.includes("SURGE"));
    assert.equal(current.surgeCost, COMBAT.SURGE_COST);
  });
});

describe("purity", () => {
  it("never mutates the state it was given, for any action", () => {
    const surgeReady = evenBattle();
    surgeReady.combatants.PLAYER.resolve = COMBAT.SURGE_COST;

    for (const [state, type] of [
      [evenBattle(), ACTIONS.BREAK],
      [surgeReady, ACTIONS.SURGE],
      [evenBattle(), ACTIONS.DEFEND],
    ]) {
      const before = structuredClone(state);
      applyAction(state, { side: SIDES.PLAYER, type });

      assert.deepEqual(state, before, `${type} left its input alone`);
    }
  });

  it("keeps every new log entry to display codes and numbers only", () => {
    const surgeReady = evenBattle();
    surgeReady.combatants.PLAYER.resolve = COMBAT.SURGE_COST;
    const entries = [
      ...applyAction(evenBattle(), { side: SIDES.PLAYER, type: ACTIONS.BREAK }).entries,
      ...applyAction(surgeReady, { side: SIDES.PLAYER, type: ACTIONS.SURGE }).entries,
    ];

    for (const entry of entries) {
      assert.equal(typeof entry.code, "string");
      for (const value of Object.values(entry)) {
        assert.ok(["string", "number", "boolean"].includes(typeof value) || value === null);
      }
    }
  });
});

describe("pve boss policy", () => {
  function pveState(pattern, { bossTurn = 0, opponent = {} } = {}) {
    const state = createBattleState({
      playerSnapshot: snapshot({ strength: 0, dexterity: 4, intelligence: 4 }, [], "Player"),
      opponentSnapshot: snapshot({ strength: 0, dexterity: 4, intelligence: 4, ...opponent }, [], "Trial"),
      encounterKey: "the-doubt",
      formulaVersion: FORMULA_VERSIONS.RESOLVE,
    });

    state.bossPattern = pattern;
    state.bossTurn = bossTurn;

    return applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
  }

  it("gives the three trials distinct policies drawn from all four actions", () => {
    const sets = ENCOUNTERS.map((encounter) => [...new Set(encounter.pattern)].sort().join(","));
    const used = new Set(ENCOUNTERS.flatMap((encounter) => encounter.pattern));

    assert.equal(new Set(sets).size, 3, "no two trials play the same way");
    assert.deepEqual([...used].sort(), ["ATTACK", "BREAK", "DEFEND", "SURGE"]);
  });

  it("falls back to a basic attack when it cannot pay for a Surge", () => {
    const state = pveState(["SURGE"]);

    assert.equal(state.combatants.OPPONENT.resolve, 0);
    assert.equal(getBossIntent(state), ACTIONS.ATTACK);

    state.combatants.OPPONENT.resolve = COMBAT.SURGE_COST;
    assert.equal(getBossIntent({ ...state, bossIntent: null }), ACTIONS.SURGE);
  });

  it("never announces an action the battle's formula version cannot resolve", () => {
    const legacy = pveState(["BREAK"]);
    legacy.formulaVersion = 1;

    assert.equal(getBossIntent({ ...legacy, bossIntent: null }), ACTIONS.ATTACK);
  });

  it("executes exactly the action it announced, every turn", () => {
    const pattern = ["DEFEND", "ATTACK", "BREAK", "ATTACK"];
    let state = pveState(pattern);
    const announcements = [];
    const executed = [];

    for (let round = 0; round < pattern.length; round += 1) {
      announcements.push(getBossIntent(state));

      const run = runBossTurns(state);
      executed.push(...run.entries.filter((entry) => pattern.includes(entry.code)).map((entry) => entry.code));

      assert.equal(run.state.activeSide, SIDES.PLAYER, "the run stops when it is the player's move");
      state = applyAction(run.state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    }

    assert.deepEqual(executed, announcements);
    assert.deepEqual(announcements, pattern, "the cycle advances one beat per turn");
  });

  it("obeys the same Resolve rules as a player", () => {
    let working = pveState(["ATTACK", "ATTACK", "ATTACK", "SURGE"]);

    for (let run = 0; run < 4; run += 1) {
      working = runBossTurns(working).state;
      if (working.status !== "ACTIVE") break;
      working = applyAction(working, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
    }

    assert.ok(working.combatants.OPPONENT.resolve >= COMBAT.RESOLVE_MIN);
    assert.ok(working.combatants.OPPONENT.resolve <= COMBAT.RESOLVE_MAX);
    assert.ok(
      working.log.some((entry) => entry.code === "SURGE" && entry.side === SIDES.OPPONENT),
      "banked Resolve was eventually spent",
    );
  });

  it("announces nothing once the trial is over", () => {
    const finished = applyAction(pveState(["ATTACK"]), { side: SIDES.OPPONENT, type: ACTIONS.FORFEIT }).state;

    assert.equal(getBossIntent(finished), null);
  });
});

describe("the battle the browser is given", () => {
  function pveBattle() {
    const state = createBattleState({
      playerSnapshot: snapshot({ strength: 4, dexterity: 4, intelligence: 4 }, [], "Player"),
      opponentSnapshot: snapshot({ strength: 4, dexterity: 4, intelligence: 4 }, [], "The Doubt"),
      encounterKey: "the-doubt",
    });
    state.bossPattern = ["DEFEND", "ATTACK"];
    state.bossTurn = 0;
    state.bossIntent = "DEFEND";

    return {
      id: 7,
      mode: "PVE",
      status: "ACTIVE",
      version: 3,
      encounterKey: "the-doubt",
      state,
      participants: [
        { userId: 42, side: SIDES.PLAYER },
        { userId: null, side: SIDES.OPPONENT, isBoss: true },
      ],
    };
  }

  function pvpBattle() {
    const battle = pveBattle();

    return {
      ...battle,
      mode: "PVP",
      encounterKey: null,
      participants: [
        { userId: 42, side: SIDES.PLAYER },
        { userId: 43, side: SIDES.OPPONENT },
      ],
    };
  }

  it("shows the trial's next move in PvE", () => {
    const dto = toClientBattle(pveBattle(), 42);

    assert.equal(dto.nextOpponentIntent, "DEFEND");
  });

  it("never reveals a sparring partner's next move, to either side", () => {
    const battle = pvpBattle();

    for (const userId of [42, 43]) {
      const dto = toClientBattle(battle, userId);

      assert.equal(dto.nextOpponentIntent, null);
      assert.equal(JSON.stringify(dto).includes("bossIntent"), false);
      assert.equal(JSON.stringify(dto).includes("bossPattern"), false);
    }
  });

  it("publishes Resolve for both sides and what the battle version supports", () => {
    const dto = toClientBattle(pveBattle(), 42);

    assert.equal(dto.you.resolve, 0);
    assert.equal(dto.them.resolve, 0);
    assert.equal(dto.you.maxResolve, COMBAT.RESOLVE_MAX);
    assert.equal(dto.surgeCost, COMBAT.SURGE_COST);
    assert.ok(dto.supportedActions.includes("SURGE"));
  });

  it("offers a version 1 battle only the actions it was started with", () => {
    const battle = pveBattle();
    battle.state.formulaVersion = 1;

    const dto = toClientBattle(battle, 42);

    assert.equal(dto.supportedActions.includes("SURGE"), false);
    assert.equal(dto.supportedActions.includes("BREAK"), false);
    assert.equal(dto.you.resolve, null);
    assert.equal(dto.surgeCost, null);
  });
});

describe("the action request contract", () => {
  const valid = { type: "ATTACK", expectedVersion: 3, idempotencyKey: "abcdefgh1234" };

  it("accepts the two new actions", () => {
    for (const type of ["BREAK", "SURGE"]) {
      assert.equal(battleActionSchema.safeParse({ ...valid, type }).success, true, type);
    }
  });

  it("still refuses anything else, and still requires a version and a key", () => {
    assert.equal(battleActionSchema.safeParse({ ...valid, type: "MEDITATE" }).success, false);
    assert.equal(battleActionSchema.safeParse({ type: "SURGE", idempotencyKey: "abcdefgh1234" }).success, false);
    assert.equal(battleActionSchema.safeParse({ type: "SURGE", expectedVersion: 3 }).success, false);
  });
});
