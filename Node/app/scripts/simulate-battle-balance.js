#!/usr/bin/env node

import { ACTIONS, SIDES, applyAction, createBattleState } from "../src/domain/combat.js";
import { COMBAT, FORMULA_VERSIONS } from "../src/domain/constants.js";
import { ENCOUNTERS, buildBossSnapshot, commitBossIntent, runBossTurns, toPublicIntent } from "../src/domain/bosses.js";
import { buildCharacterSnapshot } from "../src/domain/stats.js";
import { findSpell } from "../src/domain/spells.js";
import { STATUS_KEYS, hasCharge } from "../src/domain/statuses.js";

export const DECISION_CAP = 60;

const BASE_ALLOCATIONS = {
  strength: { strength: 6, dexterity: 2, intelligence: 2 },
  dexterity: { strength: 2, dexterity: 6, intelligence: 2 },
  intelligence: { strength: 2, dexterity: 2, intelligence: 6 },
  balanced: { strength: 4, dexterity: 3, intelligence: 3 },
};

const EARNED_BANDS = { low: 0, mid: 9, high: 21 };

const LOADOUTS = {
  strength: [
    { name: "sustain", keys: ["steady-breath", "quiet-resolve", "dawn-break"] },
    { name: "pressure", keys: ["clear-sight", "kindled-lamp", "dawn-break"] },
  ],
  dexterity: [
    { name: "tempo", keys: ["still-water", "clear-sight", "second-wind"] },
    { name: "sustain", keys: ["steady-breath", "quiet-resolve", "dawn-break"] },
  ],
  intelligence: [
    { name: "burn", keys: ["kindled-lamp", "dawn-break", "steady-breath"] },
    { name: "control", keys: ["still-water", "quiet-resolve", "dawn-break"] },
  ],
  balanced: [
    { name: "rounded", keys: ["steady-breath", "clear-sight", "dawn-break"] },
    { name: "tempo", keys: ["still-water", "kindled-lamp", "second-wind"] },
  ],
};

function totalsFor(archetype, band) {
  const base = BASE_ALLOCATIONS[archetype];
  const earned = EARNED_BANDS[band];
  const share = {
    strength: Math.round(earned * (base.strength / 10)),
    dexterity: Math.round(earned * (base.dexterity / 10)),
    intelligence: Math.round(earned * (base.intelligence / 10)),
  };

  return {
    strength: base.strength + share.strength,
    dexterity: base.dexterity + share.dexterity,
    intelligence: base.intelligence + share.intelligence,
    wisdom: 12,
  };
}

export function buildArchetypes() {
  const built = [];

  for (const archetype of Object.keys(BASE_ALLOCATIONS)) {
    for (const band of Object.keys(EARNED_BANDS)) {
      for (const loadout of LOADOUTS[archetype]) {
        const totals = totalsFor(archetype, band);
        built.push({
          id: `${archetype}/${band}/${loadout.name}`,
          archetype,
          band,
          loadout: loadout.name,
          totals,
          spellKeys: loadout.keys,
          snapshot: buildCharacterSnapshot({
            name: `${archetype}-${band}`,
            totals,
            unlockedSpellKeys: loadout.keys,
            equippedSpellKeys: loadout.keys,
          }),
        });
      }
    }
  }

  return built;
}

const castable = (state, side, key) => {
  const actor = state.combatants[side];
  const spell = findSpell(key);

  return Boolean(spell)
    && actor.spellKeys.includes(key)
    && actor.mana >= spell.manaCost
    && !(actor.cooldowns?.[key] > 0);
};

const bestSpell = (state, side) => {
  const actor = state.combatants[side];

  return [...actor.spellKeys]
    .filter((key) => castable(state, side, key))
    .sort((first, second) => (findSpell(second).power - findSpell(first).power)
      || first.localeCompare(second))[0] || null;
};

const canSurge = (state, side) => state.combatants[side].resolve >= COMBAT.SURGE_COST;

export const POLICIES = {
  "attack-only": () => ({ type: ACTIONS.ATTACK }),

  "guard-only": () => ({ type: ACTIONS.DEFEND }),

  "attack-guard": (state, side, context) => (
    context.decisions % 2 === 0 ? { type: ACTIONS.ATTACK } : { type: ACTIONS.DEFEND }
  ),

  "intent-aware": (state, side, { intent }) => {
    const opponent = side === SIDES.PLAYER ? SIDES.OPPONENT : SIDES.PLAYER;
    const action = typeof intent === "string" ? intent : intent?.action;
    const severity = typeof intent === "string" ? null : intent?.severity;

    if (state.combatants[opponent].defending) return { type: ACTIONS.BREAK };
    if (severity === "HEAVY" || action === ACTIONS.SURGE) return { type: ACTIONS.DEFEND };

    return { type: ACTIONS.ATTACK };
  },

  "spell-priority": (state, side) => {
    const key = bestSpell(state, side);

    return key ? { type: ACTIONS.CAST, spellKey: key } : { type: ACTIONS.ATTACK };
  },

  "combo-aware": (state, side, { intent }) => {
    const opponent = side === SIDES.PLAYER ? SIDES.OPPONENT : SIDES.PLAYER;
    const me = state.combatants[side];
    const action = typeof intent === "string" ? intent : intent?.action;
    const severity = typeof intent === "string" ? null : intent?.severity;

    if (hasCharge(me, STATUS_KEYS.RIPOSTE)) return { type: ACTIONS.ATTACK };

    if (!state.combatants[opponent].defending && hasCharge(state.combatants[opponent], STATUS_KEYS.EXPOSED)) {
      if (canSurge(state, side)) return { type: ACTIONS.SURGE };

      const key = bestSpell(state, side);
      const spell = key ? findSpell(key) : null;
      if (spell && ["DAMAGE", "STRIP_GUARD"].includes(spell.effect.type)) {
        return { type: ACTIONS.CAST, spellKey: key };
      }

      return { type: ACTIONS.ATTACK };
    }

    if (me.health / me.derived.maxHealth <= 0.35) {
      for (const key of me.spellKeys) {
        const spell = findSpell(key);
        if (["HEAL", "RESTORE"].includes(spell?.effect.type) && castable(state, side, key)) {
          return { type: ACTIONS.CAST, spellKey: key };
        }
      }
    }

    if (state.combatants[opponent].defending) return { type: ACTIONS.BREAK };
    if (severity === "HEAVY" || action === ACTIONS.SURGE) return { type: ACTIONS.DEFEND };
    if (canSurge(state, side)) return { type: ACTIONS.SURGE };

    const key = bestSpell(state, side);
    const spell = key ? findSpell(key) : null;
    if (spell && ["DAMAGE", "STRIP_GUARD", "BURN"].includes(spell.effect.type)) {
      return { type: ACTIONS.CAST, spellKey: key };
    }

    return { type: ACTIONS.ATTACK };
  },
};

export const POLICY_NAMES = Object.keys(POLICIES);

function emptyTally() {
  return {
    statusApplied: 0,
    statusConsumed: 0,
    statusBonus: 0,
    phaseChanges: 0,
    spellUses: {},
    playerSpellUses: {},
    playerApplied: 0,
    playerConsumed: 0,
    playerExposedApplied: 0,
    playerRiposteApplied: 0,
  };
}

function tally(into, entries) {
  for (const entry of entries) {
    if (entry.code === "STATUS_APPLIED" || entry.code === "STATUS_REFRESHED") {
      into.statusApplied += 1;
      if (entry.key === "EXPOSED" && entry.side === SIDES.OPPONENT) {
        into.playerApplied += 1;
        into.playerExposedApplied += 1;
      }
      if (entry.key === "RIPOSTE" && entry.side === SIDES.PLAYER) {
        into.playerApplied += 1;
        into.playerRiposteApplied += 1;
      }
    }
    if (entry.code === "STATUS_CONSUMED") {
      into.statusConsumed += 1;
      if ((entry.key === "RIPOSTE" && entry.side === SIDES.PLAYER)
        || (entry.key === "EXPOSED" && entry.side === SIDES.OPPONENT)) {
        into.playerConsumed += 1;
      }
    }
    if (entry.code === "STATUS_BONUS") into.statusBonus += entry.amount || 0;
    if (entry.code === "PHASE_CHANGE") into.phaseChanges += 1;
    if (entry.code === "CAST") {
      into.spellUses[entry.spellKey] = (into.spellUses[entry.spellKey] || 0) + 1;
      if (entry.side === SIDES.PLAYER) {
        into.playerSpellUses[entry.spellKey] = (into.playerSpellUses[entry.spellKey] || 0) + 1;
      }
    }
  }
}

function combatantReport(state, side) {
  const combatant = state.combatants[side];

  return {
    health: combatant.health,
    maxHealth: combatant.derived.maxHealth,
    mana: combatant.mana,
    resolve: combatant.resolve ?? 0,
  };
}

function decide(state, side, policy, context) {
  const choice = policy(state, side, context) || { type: ACTIONS.ATTACK };

  try {
    return { ...applyAction(state, { side, ...choice }), corrected: false };
  } catch (error) {
    if (!error.code) throw error;

    return { ...applyAction(state, { side, type: ACTIONS.ATTACK }), corrected: true };
  }
}

export function simulatePve({ archetype, policyName, encounterKey }) {
  const encounter = ENCOUNTERS.find((row) => row.key === encounterKey);
  const bossSnapshot = buildBossSnapshot(archetype.snapshot.rating, encounter, {
    playerSpeed: archetype.snapshot.derived.speed,
  });

  let state = createBattleState({
    playerSnapshot: archetype.snapshot,
    opponentSnapshot: bossSnapshot,
    encounterKey,
    formulaVersion: FORMULA_VERSIONS.TACTICS,
  });
  state.bossPattern = bossSnapshot.pattern;
  state.bossTurn = 0;
  state = commitBossIntent(state, []).state;

  const counts = emptyTally();
  if (state.activeSide === SIDES.OPPONENT) {
    const opening = runBossTurns(state);
    state = opening.state;
    tally(counts, opening.entries);
  }

  const policy = POLICIES[policyName];
  let decisions = 0;
  let corrected = 0;
  let reason = "COMPLETED";

  while (state.status === "ACTIVE") {
    if (decisions >= DECISION_CAP) {
      reason = "DECISION_CAP";
      break;
    }
    if (state.turn >= COMBAT.MAX_TURNS) {
      reason = "TURN_CAP";
      break;
    }

    const intent = toPublicIntent(state.bossIntent);
    const played = decide(state, SIDES.PLAYER, policy, { intent, decisions });
    state = played.state;
    tally(counts, played.entries);
    if (played.corrected) corrected += 1;
    decisions += 1;

    if (state.status === "ACTIVE") {
      const reply = runBossTurns(state);
      state = reply.state;
      tally(counts, reply.entries);
    }
  }

  return {
    kind: "PVE",
    build: archetype.id,
    policy: policyName,
    encounter: encounterKey,
    winner: state.winner === SIDES.PLAYER ? "PLAYER" : state.winner === SIDES.OPPONENT ? "BOSS" : "NONE",
    turns: state.turn,
    decisions,
    corrected,
    player: combatantReport(state, SIDES.PLAYER),
    opponent: combatantReport(state, SIDES.OPPONENT),
    ...counts,
    reason: state.status === "COMPLETED" ? reason : reason === "COMPLETED" ? "UNRESOLVED" : reason,
  };
}

export function simulateDuel({ first, second, firstPolicy, secondPolicy }) {
  let state = createBattleState({
    playerSnapshot: first.snapshot,
    opponentSnapshot: second.snapshot,
    formulaVersion: FORMULA_VERSIONS.TACTICS,
  });

  const counts = emptyTally();
  const policies = { [SIDES.PLAYER]: POLICIES[firstPolicy], [SIDES.OPPONENT]: POLICIES[secondPolicy] };
  const decisions = { [SIDES.PLAYER]: 0, [SIDES.OPPONENT]: 0 };
  let corrected = 0;
  let reason = "COMPLETED";

  while (state.status === "ACTIVE") {
    const side = state.activeSide;

    if (decisions[side] >= DECISION_CAP) {
      reason = "DECISION_CAP";
      break;
    }
    if (state.turn >= COMBAT.MAX_TURNS) {
      reason = "TURN_CAP";
      break;
    }

    const played = decide(state, side, policies[side], { intent: null, decisions: decisions[side] });
    state = played.state;
    tally(counts, played.entries);
    if (played.corrected) corrected += 1;
    decisions[side] += 1;
  }

  return {
    kind: "DUEL",
    build: first.id,
    policy: firstPolicy,
    opponentBuild: second.id,
    opponentPolicy: secondPolicy,
    winner: state.winner === SIDES.PLAYER ? "FIRST" : state.winner === SIDES.OPPONENT ? "SECOND" : "NONE",
    turns: state.turn,
    decisions: decisions[SIDES.PLAYER] + decisions[SIDES.OPPONENT],
    corrected,
    player: combatantReport(state, SIDES.PLAYER),
    opponent: combatantReport(state, SIDES.OPPONENT),
    ...counts,
    reason: state.status === "COMPLETED" ? reason : reason === "COMPLETED" ? "UNRESOLVED" : reason,
  };
}

export function runPveMatrix(archetypes = buildArchetypes()) {
  const rows = [];

  for (const archetype of archetypes) {
    for (const policyName of POLICY_NAMES) {
      for (const encounter of ENCOUNTERS) {
        rows.push(simulatePve({ archetype, policyName, encounterKey: encounter.key }));
      }
    }
  }

  return rows;
}

export const TYPICAL_PAIRINGS = [
  { band: "low", encounterKey: "the-doubt" },
  { band: "mid", encounterKey: "the-distraction" },
  { band: "high", encounterKey: "the-discouragement" },
];

export const CAPABLE_POLICIES = ["intent-aware", "spell-priority", "combo-aware"];

export function runTypicalMatrix(archetypes = buildArchetypes()) {
  const rows = [];

  for (const { band, encounterKey } of TYPICAL_PAIRINGS) {
    for (const archetype of archetypes.filter((entry) => entry.band === band)) {
      for (const policyName of CAPABLE_POLICIES) {
        rows.push(simulatePve({ archetype, policyName, encounterKey }));
      }
    }
  }

  return rows;
}

export function runDuelMatrix(archetypes = buildArchetypes()) {
  const contenders = archetypes.filter((entry) => entry.band === "mid");
  const policies = ["attack-only", "intent-aware", "combo-aware", "spell-priority"];
  const rows = [];

  for (const first of contenders) {
    for (const second of contenders) {
      if (first.id === second.id) continue;

      for (const policy of policies) {
        rows.push(simulateDuel({ first, second, firstPolicy: policy, secondPolicy: policy }));
        rows.push(simulateDuel({ first: second, second: first, firstPolicy: policy, secondPolicy: policy }));
      }
    }
  }

  return rows;
}

function pad(value, width) {
  const text = String(value);

  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function padLeft(value, width) {
  const text = String(value);

  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

const COLUMNS = [
  ["build", 30], ["policy", 15], ["encounter", 19], ["winner", 7],
  ["turns", 6], ["decisions", 10], ["hp", 9], ["mana", 6], ["resolve", 8],
  ["casts", 6], ["applied", 8], ["consumed", 9], ["phases", 7], ["reason", 12],
];

function pveRow(row) {
  const casts = Object.values(row.spellUses).reduce((sum, count) => sum + count, 0);

  return [
    pad(row.build, 30), pad(row.policy, 15), pad(row.encounter, 19), pad(row.winner, 7),
    padLeft(row.turns, 6), padLeft(row.decisions, 10),
    padLeft(`${row.player.health}/${row.player.maxHealth}`, 9),
    padLeft(row.player.mana, 6), padLeft(row.player.resolve, 8),
    padLeft(casts, 6), padLeft(row.statusApplied, 8), padLeft(row.statusConsumed, 9),
    padLeft(row.phaseChanges, 7), pad(row.reason, 12),
  ].join(" ");
}

function summarise(rows) {
  const byPolicy = {};

  for (const row of rows) {
    const bucket = byPolicy[row.policy] || (byPolicy[row.policy] = { runs: 0, wins: 0, decisions: 0, consumed: 0 });
    bucket.runs += 1;
    bucket.wins += row.winner === "PLAYER" ? 1 : 0;
    bucket.decisions += row.decisions;
    bucket.consumed += row.playerConsumed;
  }

  return Object.entries(byPolicy).map(([policy, bucket]) => ({
    policy,
    runs: bucket.runs,
    wins: bucket.wins,
    winRate: Number((bucket.wins / bucket.runs).toFixed(3)),
    meanDecisions: Number((bucket.decisions / bucket.runs).toFixed(1)),
    chargesConsumed: bucket.consumed,
  }));
}

export function decisionStats(rows) {
  const counts = rows.map((row) => row.decisions).sort((first, second) => first - second);
  const at = (share) => counts[Math.min(counts.length - 1, Math.floor(counts.length * share))];

  return {
    runs: counts.length,
    min: counts[0],
    median: at(0.5),
    p90: at(0.9),
    max: counts[counts.length - 1],
    mean: Number((counts.reduce((sum, value) => sum + value, 0) / counts.length).toFixed(1)),
    withinTarget: Number((counts.filter((value) => value >= 8 && value <= 18).length / counts.length).toFixed(3)),
  };
}

function duelSummary(rows) {
  const firstSeatWins = rows.filter((row) => row.winner === "FIRST").length;
  const secondSeatWins = rows.filter((row) => row.winner === "SECOND").length;

  return {
    runs: rows.length,
    firstSeatWins,
    secondSeatWins,
    unresolved: rows.filter((row) => row.winner === "NONE").length,
    firstSeatShare: Number((firstSeatWins / rows.length).toFixed(3)),
  };
}

function main() {
  const jsonOnly = process.argv.includes("--json");
  const archetypes = buildArchetypes();
  const pve = runPveMatrix(archetypes);
  const typical = runTypicalMatrix(archetypes);
  const duels = runDuelMatrix(archetypes);

  const report = {
    formulaVersion: FORMULA_VERSIONS.TACTICS,
    builds: archetypes.length,
    policies: POLICY_NAMES,
    pveRuns: pve.length,
    duelRuns: duels.length,
    pveByPolicy: summarise(pve),
    typicalByPolicy: summarise(typical),
    typicalDecisions: decisionStats(typical),
    duels: duelSummary(duels),
    unresolved: pve.filter((row) => row.reason !== "COMPLETED").map((row) => `${row.build} ${row.policy} ${row.encounter} ${row.reason}`),
    correctedChoices: pve.reduce((sum, row) => sum + row.corrected, 0),
  };

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify({ ...report, pve, duels }, null, 2)}\n`);
    return;
  }

  process.stdout.write("Achimari Battle V3 — deterministic balance report\n");
  process.stdout.write(`formula version ${report.formulaVersion} · ${report.builds} builds · ${POLICY_NAMES.length} policies · ${ENCOUNTERS.length} trials\n\n`);

  process.stdout.write("PvE matrix\n");
  process.stdout.write(`${COLUMNS.map(([name, width]) => pad(name, width)).join(" ")}\n`);
  process.stdout.write(`${COLUMNS.map(([, width]) => "-".repeat(width)).join(" ")}\n`);
  for (const row of pve) process.stdout.write(`${pveRow(row)}\n`);

  process.stdout.write("\nPvE by policy\n");
  process.stdout.write(`${pad("policy", 15)}${padLeft("runs", 6)}${padLeft("wins", 6)}${padLeft("win rate", 10)}${padLeft("mean decisions", 16)}${padLeft("charges spent", 15)}\n`);
  for (const row of report.pveByPolicy) {
    process.stdout.write(
      `${pad(row.policy, 15)}${padLeft(row.runs, 6)}${padLeft(row.wins, 6)}${padLeft(row.winRate, 10)}${padLeft(row.meanDecisions, 16)}${padLeft(row.chargesConsumed, 15)}\n`,
    );
  }

  process.stdout.write("\nTypical progression cohort (the pairings gating actually allows)\n");
  process.stdout.write(`${pad("policy", 15)}${padLeft("runs", 6)}${padLeft("wins", 6)}${padLeft("win rate", 10)}${padLeft("mean decisions", 16)}${padLeft("charges spent", 15)}\n`);
  for (const row of report.typicalByPolicy) {
    process.stdout.write(
      `${pad(row.policy, 15)}${padLeft(row.runs, 6)}${padLeft(row.wins, 6)}${padLeft(row.winRate, 10)}${padLeft(row.meanDecisions, 16)}${padLeft(row.chargesConsumed, 15)}\n`,
    );
  }
  process.stdout.write(`decisions: ${JSON.stringify(report.typicalDecisions)}\n`);

  process.stdout.write("\nSide-swapped duels\n");
  process.stdout.write(`${JSON.stringify(report.duels)}\n`);

  process.stdout.write(`\nUnresolved runs: ${report.unresolved.length}\n`);
  for (const line of report.unresolved) process.stdout.write(`  ${line}\n`);
  process.stdout.write(`Corrected (illegal) policy choices: ${report.correctedChoices}\n`);

  process.stdout.write(`\nSUMMARY_JSON ${JSON.stringify(report)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("simulate-battle-balance.js")) {
  main();
}
