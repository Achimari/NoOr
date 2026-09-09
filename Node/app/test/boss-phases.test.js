import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENCOUNTERS,
  buildBossSnapshot,
  commitBossIntent,
  findEncounter,
  getBossIntent,
  runBossTurns,
  toPublicIntent,
} from "../src/domain/bosses.js";
import { INTENT_SEVERITIES, selectPhase } from "../src/domain/bossPhases.js";
import { ACTIONS, SIDES, applyAction, createBattleState } from "../src/domain/combat.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { FORMULA_VERSIONS } from "../src/domain/constants.js";

function pveBattle(encounterKey, { playerStats = {}, bossRating = 300 } = {}) {
  const encounter = findEncounter(encounterKey);
  const playerSnapshot = buildCharacterSnapshot({
    totals: { strength: 6, dexterity: 5, intelligence: 4, wisdom: 0, ...playerStats },
    unlockedSpellKeys: [],
    name: "Player",
  });
  const bossSnapshot = buildBossSnapshot(bossRating, encounter);

  const state = createBattleState({
    playerSnapshot,
    opponentSnapshot: bossSnapshot,
    encounterKey,
  });
  state.formulaVersion = FORMULA_VERSIONS.TACTICS;
  state.bossPattern = bossSnapshot.pattern;
  state.bossTurn = 0;
  state.combatants[SIDES.OPPONENT].spellKeys = [...(bossSnapshot.spellKeys || [])];

  return commitBossIntent(state, []).state;
}

function setBossHealth(state, ratio) {
  const boss = state.combatants[SIDES.OPPONENT];
  boss.health = Math.max(1, Math.round(boss.derived.maxHealth * ratio));

  return state;
}

describe("phase selection", () => {
  it("uses STEADY above 60% and PRESSURE at or below it", () => {
    const doubt = findEncounter("the-doubt");

    assert.equal(selectPhase(doubt, 1).key, "STEADY");
    assert.equal(selectPhase(doubt, 0.61).key, "STEADY");
    assert.equal(selectPhase(doubt, 0.6).key, "PRESSURE", "the boundary belongs to PRESSURE");
    assert.equal(selectPhase(doubt, 0.05).key, "PRESSURE", "only the final trial has a third phase");
  });

  it("gives the final trial a LAST_STAND at or below 25%", () => {
    const final = findEncounter("the-discouragement");

    assert.equal(selectPhase(final, 0.6).key, "PRESSURE");
    assert.equal(selectPhase(final, 0.26).key, "PRESSURE");
    assert.equal(selectPhase(final, 0.25).key, "LAST_STAND", "the boundary belongs to LAST_STAND");
    assert.equal(selectPhase(final, 0.01).key, "LAST_STAND");
  });

  it("gives every encounter data-defined phases of intent descriptors", () => {
    for (const encounter of ENCOUNTERS) {
      assert.ok(encounter.phases?.length >= 2, `${encounter.key} has phases`);

      for (const phase of encounter.phases) {
        assert.ok(phase.sequence.length > 0, `${encounter.key}/${phase.key} has a sequence`);

        for (const descriptor of phase.sequence) {
          assert.ok(Object.values(ACTIONS).includes(descriptor.action), "a real action");
          assert.ok(INTENT_SEVERITIES.includes(descriptor.severity), `${descriptor.severity} is a known severity`);
          assert.equal(typeof descriptor.label, "string");
          assert.ok(descriptor.label.length > 0);
          assert.equal(typeof descriptor.counter, "string");
          assert.ok(descriptor.counter.length > 0);
        }
      }
    }
  });
});

describe("committed intent", () => {
  it("commits a structured intent, not a bare action string", () => {
    const intent = getBossIntent(pveBattle("the-doubt"));

    assert.equal(typeof intent, "object");
    assert.equal(typeof intent.action, "string");
    assert.equal(typeof intent.label, "string");
    assert.equal(typeof intent.counter, "string");
    assert.equal(intent.phase, "STEADY");
    assert.ok(INTENT_SEVERITIES.includes(intent.severity));
  });

  it("previews the exact raw damage a damaging intent will deal", () => {
    const state = pveBattle("the-doubt");
    const intent = getBossIntent(state);

    assert.equal(intent.action, ACTIONS.ATTACK, "The Doubt opens with a plain strike");
    assert.equal(intent.estimatedDamage, state.combatants[SIDES.OPPONENT].derived.basicDamage);
  });

  it("executes exactly the action it committed and showed", () => {
    let state = pveBattle("the-doubt");

    for (let round = 0; round < 8 && state.status === "ACTIVE"; round += 1) {
      const shown = getBossIntent(state);
      if (!shown) break;

      if (state.activeSide === SIDES.PLAYER) {
        state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.DEFEND }).state;
      }
      if (state.activeSide !== SIDES.OPPONENT) continue;

      const before = state.log.length;
      state = runBossTurns(state).state;
      const played = state.log.slice(before).filter((entry) => (
        [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.BREAK, ACTIONS.SURGE, "CAST"].includes(entry.code)
      ));

      assert.equal(played[0]?.code, shown.action, `round ${round}: played what it showed`);
    }
  });

  it("never commits an intent the boss could not legally take", () => {
    let state = pveBattle("the-discouragement");
    setBossHealth(state, 0.2);
    state.combatants[SIDES.OPPONENT].resolve = 0;
    state = commitBossIntent(state, [], { force: true }).state;

    const intent = getBossIntent(state);
    assert.notEqual(intent.action, ACTIONS.SURGE, "an unaffordable Surge is never shown");
  });

  it("keeps a shown intent stable while the player takes their turn", () => {
    let state = pveBattle("the-doubt");
    if (state.activeSide === SIDES.OPPONENT) state = runBossTurns(state).state;

    const shown = getBossIntent(state);
    state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;

    assert.deepEqual(
      getBossIntent(state),
      shown,
      "the trial does not read the player's move and change what it announced",
    );
  });
});

describe("phase transitions", () => {
  it("changes phase when the boss crosses the threshold, and says so once", () => {
    let state = pveBattle("the-doubt");
    assert.equal(state.bossPhase, "STEADY");

    setBossHealth(state, 0.4);
    const changed = commitBossIntent(state, [], { force: true });

    assert.equal(changed.state.bossPhase, "PRESSURE");
    assert.equal(
      changed.entries.filter((entry) => entry.code === "PHASE_CHANGE").length,
      1,
      "one banner, not one per turn",
    );
    assert.equal(changed.entries.find((entry) => entry.code === "PHASE_CHANGE").phase, "PRESSURE");

    const again = commitBossIntent(changed.state, [], { force: true });
    assert.equal(again.entries.filter((entry) => entry.code === "PHASE_CHANGE").length, 0, "announced once");
  });

  it("restarts the cycle at the top of a new phase", () => {
    let state = pveBattle("the-doubt");
    state.bossPhaseTurn = 3;

    setBossHealth(state, 0.3);
    state = commitBossIntent(state, [], { force: true }).state;

    assert.equal(state.bossPhaseTurn, 0, "a new phase begins at its own first beat");
  });

  it("reaches every phase of every encounter as the boss loses health", () => {
    for (const encounter of ENCOUNTERS) {
      const seen = new Set();

      for (const ratio of [1, 0.8, 0.6, 0.5, 0.25, 0.1]) {
        const state = setBossHealth(pveBattle(encounter.key), ratio);
        seen.add(commitBossIntent(state, [], { force: true }).state.bossPhase);
      }

      assert.deepEqual(
        [...seen].sort(),
        encounter.phases.map((phase) => phase.key).sort(),
        `${encounter.key} reaches all of its phases`,
      );
    }
  });
});

describe("intent privacy", () => {
  it("publishes only display fields - never a pattern, a cycle index or a rule", () => {
    const state = pveBattle("the-distraction");
    const published = toPublicIntent(getBossIntent(state));

    assert.deepEqual(
      Object.keys(published).sort(),
      ["action", "counter", "effectSummary", "estimatedDamage", "label", "phase", "severity", "spellKey"],
    );
    for (const value of Object.values(published)) {
      assert.ok(["string", "number"].includes(typeof value) || value === null);
    }
  });

  it("preserves a version 2 battle's plain string intent", () => {
    const state = pveBattle("the-doubt");
    state.formulaVersion = 2;
    state.bossIntent = "ATTACK";

    assert.equal(getBossIntent(state), "ATTACK");
    assert.equal(toPublicIntent("ATTACK"), "ATTACK");
  });
});

describe("what the browser receives", () => {
  function pveRow(state, userId = 7) {
    return {
      id: 1,
      mode: "PVE",
      status: "ACTIVE",
      version: 3,
      encounterKey: state.encounterKey,
      state,
      participants: [
        { userId, side: SIDES.PLAYER },
        { userId: null, side: SIDES.OPPONENT, isBoss: true },
      ],
    };
  }

  it("gives a PvE player the committed structured intent and its phase", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const battle = toClientBattle(pveRow(pveBattle("the-discouragement")), 7);

    assert.equal(typeof battle.nextOpponentIntent, "object");
    assert.equal(battle.nextOpponentIntent.phase, "STEADY");
    assert.equal(typeof battle.nextOpponentIntent.counter, "string");
  });

  it("never sends the pattern, the cycle index or the raw phase state", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const state = pveBattle("the-distraction");
    const serialised = JSON.stringify(toClientBattle(pveRow(state), 7));

    assert.equal(serialised.includes("bossPattern"), false);
    assert.equal(serialised.includes("bossPhaseTurn"), false);
    assert.equal(serialised.includes("bossTurn"), false);
    assert.equal(serialised.includes("threshold"), false);
    assert.equal(serialised.includes("sequence"), false);
  });

  it("still returns nothing at all for a PvP opponent", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const state = pveBattle("the-doubt");
    const pvp = { ...pveRow(state), mode: "PVP", encounterKey: null };
    pvp.participants = [
      { userId: 7, side: SIDES.PLAYER },
      { userId: 9, side: SIDES.OPPONENT },
    ];

    assert.equal(toClientBattle(pvp, 7).nextOpponentIntent, null);
    assert.equal(toClientBattle(pvp, 9).nextOpponentIntent, null);
  });

  it("gives the boss's own side no intent, even in PvE", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const row = pveRow(pveBattle("the-doubt"));
    row.participants = [
      { userId: 7, side: SIDES.OPPONENT },
      { userId: null, side: SIDES.PLAYER, isBoss: true },
    ];

    assert.equal(toClientBattle(row, 7).nextOpponentIntent, null);
  });

  it("publishes the public phase key beside the intent, and nothing more", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const state = setBossHealth(pveBattle("the-discouragement"), 0.2);
    const committed = commitBossIntent(state, [], { force: true }).state;

    assert.equal(toClientBattle(pveRow(committed), 7).nextOpponentIntent.phase, "LAST_STAND");
  });
});

describe("starting a version 3 trial", () => {
  it("creates the state at the version the caller asks for", async () => {
    const { createBattleState } = await import("../src/domain/combat.js");
    const { FORMULA_VERSION, PVP_FORMULA_VERSION } = await import("../src/domain/constants.js");
    const snapshot = buildCharacterSnapshot({
      totals: { strength: 4, dexterity: 4, intelligence: 4, wisdom: 0 },
      unlockedSpellKeys: [],
    });

    const fresh = createBattleState({ playerSnapshot: snapshot, opponentSnapshot: snapshot });
    assert.equal(fresh.formulaVersion, FORMULA_VERSION);

    const pinned = createBattleState({
      playerSnapshot: snapshot,
      opponentSnapshot: snapshot,
      formulaVersion: PVP_FORMULA_VERSION,
    });
    assert.equal(pinned.formulaVersion, PVP_FORMULA_VERSION);
  });

  it("runs new PvE trials on formula 3", async () => {
    const { FORMULA_VERSION, FORMULA_VERSIONS } = await import("../src/domain/constants.js");

    assert.equal(FORMULA_VERSION, FORMULA_VERSIONS.TACTICS);
  });

  it("commits a phase, a cycle position and an intent at creation", () => {
    const state = pveBattle("the-doubt");

    assert.equal(state.bossPhase, "STEADY");
    assert.equal(state.bossPhaseTurn, 0);
    assert.equal(typeof state.bossIntent, "object");
  });
});

describe("a phase change reaches the browser", () => {
  it("writes PHASE_CHANGE into the battle log, not just the return value", () => {
    let state = pveBattle("the-doubt");
    setBossHealth(state, 0.62);

    if (state.activeSide === SIDES.PLAYER) {
      state = applyAction(state, { side: SIDES.PLAYER, type: ACTIONS.ATTACK }).state;
    }
    setBossHealth(state, 0.5);
    const run = runBossTurns(state);

    assert.ok(
      run.entries.some((entry) => entry.code === "PHASE_CHANGE"),
      "the transition is reported to the caller",
    );
    assert.ok(
      run.state.log.some((entry) => entry.code === "PHASE_CHANGE"),
      "and is recorded in the log the browser actually reads",
    );
  });

  it("does not announce a phase change at the start of a battle", () => {
    const state = pveBattle("the-doubt");

    assert.equal(state.bossPhase, "STEADY");
    assert.ok(
      !state.log.some((entry) => entry.code === "PHASE_CHANGE"),
      "opening in a phase is not a change",
    );
  });
});

describe("an opponent's spell tray stays private", () => {
  it("gives a PvP viewer their own resolved spells and never the other side's", async () => {
    const { toClientBattle } = await import("../src/domain/battleDto.js");
    const state = pveBattle("the-doubt");
    state.combatants[SIDES.PLAYER].spellKeys = ["dawn-break"];
    state.combatants[SIDES.OPPONENT].spellKeys = ["dawn-break"];

    const row = {
      id: 2,
      mode: "PVP",
      status: "ACTIVE",
      version: 1,
      encounterKey: null,
      state,
      participants: [
        { userId: 7, side: SIDES.PLAYER },
        { userId: 9, side: SIDES.OPPONENT },
      ],
    };

    for (const userId of [7, 9]) {
      const battle = toClientBattle(row, userId);

      assert.ok(Array.isArray(battle.you.spells), "you get your own tray, resolved");
      assert.equal(battle.you.spells.length, 1);
      assert.equal(
        battle.them.spells,
        undefined,
        "an opponent's remaining cooldowns are their own business",
      );
      assert.ok(Array.isArray(battle.them.statuses));
    }
  });
});
