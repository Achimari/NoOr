import { COMBAT, FORMULA_VERSION, FORMULA_VERSIONS } from "./constants.js";
import { adjustGauge, advanceToNextActor, consumeTurn, projectTurnOrder } from "./initiative.js";
import { findSpell, resolveSpellEffect, SPELL_TARGETS } from "./spells.js";
import { STATUS_KEYS, consumeCharge, describeStatuses, grantCharge } from "./statuses.js";

export const SIDES = { PLAYER: "PLAYER", OPPONENT: "OPPONENT" };

export const ACTIONS = {
  ATTACK: "ATTACK",
  DEFEND: "DEFEND",
  BREAK: "BREAK",
  SURGE: "SURGE",
  CAST: "CAST",
  FORFEIT: "FORFEIT",
};

export class CombatError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function other(side) {
  return side === SIDES.PLAYER ? SIDES.OPPONENT : SIDES.PLAYER;
}

export function getFormulaVersion(state) {
  const version = Number(state?.formulaVersion);

  return Number.isInteger(version) && version > 0 ? version : FORMULA_VERSIONS.BASE;
}

export function supportsResolve(state) {
  return getFormulaVersion(state) >= FORMULA_VERSIONS.RESOLVE;
}

export function supportsTactics(state) {
  return getFormulaVersion(state) >= FORMULA_VERSIONS.TACTICS;
}

export function getSupportedActions(state) {
  const base = [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.CAST, ACTIONS.FORFEIT];

  return supportsResolve(state) ? [...base, ACTIONS.BREAK, ACTIONS.SURGE] : base;
}

export function clampResolve(value) {
  const resolve = Number(value) || 0;

  return Math.max(COMBAT.RESOLVE_MIN, Math.min(COMBAT.RESOLVE_MAX, Math.round(resolve)));
}

function addResolve(state, side, amount, entries) {
  if (!supportsResolve(state) || !amount) return;

  const combatant = state.combatants[side];
  const before = clampResolve(combatant.resolve);
  combatant.resolve = clampResolve(before + amount);

  const gained = combatant.resolve - before;
  if (gained > 0) {
    log(entries, "RESOLVE_GAIN", { side, amount: gained, resolve: combatant.resolve });
  }
}

function spendResolve(state, side, amount, entries) {
  const combatant = state.combatants[side];
  const before = clampResolve(combatant.resolve);

  combatant.resolve = clampResolve(before - amount);
  log(entries, "RESOLVE_SPEND", { side, amount, resolve: combatant.resolve });
}

function applyCharge(state, side, key, entries) {
  if (!supportsTactics(state)) return;

  const outcome = grantCharge(state.combatants[side], key);
  log(entries, outcome === "REFRESHED" ? "STATUS_REFRESHED" : "STATUS_APPLIED", { side, key });
}

function boostDirectDamage(state, actorSide, targetSide, kind, rawAmount, entries) {
  if (!supportsTactics(state)) return rawAmount;

  const actor = state.combatants[actorSide];
  const target = state.combatants[targetSide];
  const spent = [];

  if (kind === ACTIONS.ATTACK && consumeCharge(actor, STATUS_KEYS.RIPOSTE)) {
    spent.push({ key: STATUS_KEYS.RIPOSTE, side: actorSide, multiplier: COMBAT.RIPOSTE_MULTIPLIER });
  }
  if (consumeCharge(target, STATUS_KEYS.EXPOSED)) {
    spent.push({ key: STATUS_KEYS.EXPOSED, side: targetSide, multiplier: COMBAT.EXPOSED_MULTIPLIER });
  }
  if (!spent.length) return rawAmount;

  for (const charge of spent) {
    log(entries, "STATUS_CONSUMED", { side: charge.side, key: charge.key });
  }

  let running = rawAmount;
  for (const charge of spent) {
    const next = running * charge.multiplier;
    const bonus = Math.round(next) - Math.round(running);

    if (bonus > 0) {
      log(entries, "STATUS_BONUS", { side: actorSide, targetSide, key: charge.key, amount: bonus });
    }
    running = next;
  }

  return running;
}

export function remainingCooldown(combatant, spellKey) {
  return Math.max(0, Number(combatant?.cooldowns?.[spellKey]) || 0);
}

function startCooldown(state, side, spell) {
  if (!supportsTactics(state) || !spell.cooldownTurns) return;

  const combatant = state.combatants[side];
  combatant.cooldowns = combatant.cooldowns || {};
  combatant.cooldowns[spell.key] = spell.cooldownTurns + 1;
}

function tickCooldowns(state, side) {
  const combatant = state.combatants[side];
  if (!supportsTactics(state) || !combatant.cooldowns) return;

  for (const [key, remaining] of Object.entries(combatant.cooldowns)) {
    if (remaining <= 1) delete combatant.cooldowns[key];
    else combatant.cooldowns[key] = remaining - 1;
  }

  if (!Object.keys(combatant.cooldowns).length) delete combatant.cooldowns;
}

function makeCombatant(side, snapshot, tieBreak) {
  return {
    side,
    name: snapshot.name || null,
    stats: { ...snapshot.stats },
    derived: { ...snapshot.derived },
    spellKeys: [...(snapshot.spellKeys || [])],
    health: snapshot.derived.maxHealth,
    mana: snapshot.derived.maxMana,
    gauge: 0,
    resolve: COMBAT.RESOLVE_MIN,
    tieBreak,
    defending: false,
    shield: 0,
    burn: null,
  };
}

export function createBattleState({
  playerSnapshot,
  opponentSnapshot,
  encounterKey = null,
  formulaVersion = FORMULA_VERSION,
}) {
  const state = {
    formulaVersion,
    encounterKey,
    status: "ACTIVE",
    winner: null,
    turn: 0,
    combatants: {
      [SIDES.PLAYER]: makeCombatant(SIDES.PLAYER, playerSnapshot, 0),
      [SIDES.OPPONENT]: makeCombatant(SIDES.OPPONENT, opponentSnapshot, 1),
    },
    log: [],
    activeSide: null,
  };

  return startNextTurn(state, []).state;
}

function gaugeActors(state) {
  return Object.values(state.combatants).map((combatant) => ({
    side: combatant.side,
    speed: combatant.derived.speed,
    gauge: combatant.gauge,
    tieBreak: combatant.tieBreak,
  }));
}

function writeGauges(state, actors) {
  for (const actor of actors) {
    state.combatants[actor.side].gauge = actor.gauge;
  }
}

function log(entries, code, payload = {}) {
  entries.push({ code, ...payload });
}

function startNextTurn(state, entries) {
  const step = advanceToNextActor(gaugeActors(state));
  writeGauges(state, step.actors);

  const acting = state.combatants[step.actingSide];

  if (acting.burn && acting.burn.turns > 0) {
    acting.health = Math.max(0, acting.health - acting.burn.damage);
    log(entries, "BURN_TICK", { side: acting.side, amount: acting.burn.damage, health: acting.health });
    acting.burn = acting.burn.turns > 1
      ? { ...acting.burn, turns: acting.burn.turns - 1 }
      : null;

    if (acting.health <= 0) {
      return { state: finish(state, other(acting.side), entries), entries };
    }
  }

  state.activeSide = step.actingSide;
  state.turn += 1;

  return { state, entries };
}

function finish(state, winner, entries) {
  state.status = "COMPLETED";
  state.winner = winner;
  state.activeSide = null;
  log(entries, "BATTLE_END", { winner });

  return state;
}

function applyDamage(state, targetSide, rawAmount, entries, { ignoreGuard = false } = {}) {
  const target = state.combatants[targetSide];
  let amount = Math.max(0, Math.round(rawAmount));

  if (!ignoreGuard && target.defending) {
    amount = Math.round(amount * COMBAT.DEFEND_REDUCTION);
    target.defending = false;
    log(entries, "GUARD_ABSORB", { side: targetSide });
    addResolve(state, targetSide, COMBAT.RESOLVE_ON_GUARD_ABSORB, entries);
    applyCharge(state, targetSide, STATUS_KEYS.RIPOSTE, entries);
  }

  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
    log(entries, "SHIELD_ABSORB", { side: targetSide, amount: absorbed, remaining: target.shield });
  }

  target.health = Math.max(0, target.health - amount);

  return amount;
}

function assertSupported(state, type) {
  if (!getSupportedActions(state).includes(type)) {
    throw new CombatError(
      "That action is not available in this battle",
      "UNSUPPORTED_ACTION",
    );
  }
}

function assertActable(state, side) {
  if (state.status !== "ACTIVE") {
    throw new CombatError("This battle is already finished", "BATTLE_COMPLETED");
  }
  if (state.activeSide !== side) {
    throw new CombatError("It is not your turn yet", "OUT_OF_TURN");
  }
}

function resolveSpell(state, side, spellKey, entries) {
  const actor = state.combatants[side];
  const spell = findSpell(spellKey);

  if (!spell) {
    throw new CombatError("That spell does not exist", "UNKNOWN_SPELL");
  }
  if (!actor.spellKeys.includes(spellKey)) {
    throw new CombatError("You have not unlocked that spell", "SPELL_LOCKED");
  }
  if (actor.mana < spell.manaCost) {
    throw new CombatError(`Not enough mana for ${spell.name}`, "INSUFFICIENT_MANA");
  }
  const cooling = supportsTactics(state) ? remainingCooldown(actor, spellKey) : 0;
  if (cooling > 0) {
    throw new CombatError(
      `${spell.name} is ready again in ${cooling} ${cooling === 1 ? "turn" : "turns"}`,
      "SPELL_ON_COOLDOWN",
    );
  }

  const targetSide = spell.target === SPELL_TARGETS.SELF ? side : other(side);
  const target = state.combatants[targetSide];
  const effect = resolveSpellEffect(spell, actor.stats, { tactics: supportsTactics(state) });

  actor.mana -= spell.manaCost;
  startCooldown(state, side, spell);
  log(entries, "CAST", { side, spellKey, manaCost: spell.manaCost, mana: actor.mana });

  switch (effect.type) {
    case "HEAL": {
      const before = actor.health;
      actor.health = Math.min(actor.derived.maxHealth, actor.health + effect.amount);
      log(entries, "HEAL", { side, amount: actor.health - before, health: actor.health });
      break;
    }
    case "SHIELD": {
      const requested = actor.shield + effect.amount;
      const cap = supportsTactics(state)
        ? Math.round(actor.derived.maxHealth * COMBAT.SHIELD_CAP_RATIO)
        : requested;

      actor.shield = Math.min(requested, cap);
      log(entries, "SHIELD", {
        side,
        amount: effect.amount,
        shield: actor.shield,
        capped: actor.shield < requested,
      });
      break;
    }
    case "DAMAGE": {
      const raw = boostDirectDamage(state, side, targetSide, ACTIONS.CAST, effect.amount, entries);
      const dealt = applyDamage(state, targetSide, raw, entries);
      log(entries, "DAMAGE", { side, targetSide, amount: dealt, health: target.health });
      break;
    }
    case "STRIP_GUARD": {
      if (target.defending) {
        target.defending = false;
        log(entries, "GUARD_BROKEN", { side: targetSide });
      }
      const raw = boostDirectDamage(state, side, targetSide, ACTIONS.CAST, effect.damage, entries);
      const dealt = applyDamage(state, targetSide, raw, entries, { ignoreGuard: true });
      log(entries, "DAMAGE", { side, targetSide, amount: dealt, health: target.health });
      break;
    }
    case "SLOW": {
      writeGauges(state, adjustGauge(gaugeActors(state), targetSide, -effect.gauge));
      log(entries, "SLOW", { side, targetSide, amount: effect.gauge });
      break;
    }
    case "BURN": {
      const existing = supportsTactics(state) && target.burn?.turns > 0 ? target.burn : null;

      target.burn = existing
        ? {
            damage: Math.max(existing.damage, effect.damage),
            turns: Math.max(existing.turns, effect.turns),
          }
        : { damage: effect.damage, turns: effect.turns };
      log(entries, "BURN_APPLIED", {
        side,
        targetSide,
        amount: target.burn.damage,
        turns: target.burn.turns,
      });
      break;
    }
    case "RESTORE": {
      const before = actor.health;
      actor.health = Math.min(actor.derived.maxHealth, actor.health + effect.health);
      writeGauges(state, adjustGauge(gaugeActors(state), side, effect.gauge));
      log(entries, "RESTORE", { side, amount: actor.health - before, health: actor.health, gauge: effect.gauge });
      break;
    }
    default:
      throw new CombatError("That spell cannot be resolved", "UNKNOWN_EFFECT");
  }
}

export function applyAction(previousState, { side, type, spellKey = null }) {
  const state = structuredClone(previousState);
  const entries = [];

  assertActable(state, side);

  const actor = state.combatants[side];
  const opponentSide = other(side);

  switch (type) {
    case ACTIONS.ATTACK: {
      const raw = boostDirectDamage(
        state,
        side,
        opponentSide,
        ACTIONS.ATTACK,
        actor.derived.basicDamage,
        entries,
      );
      const dealt = applyDamage(state, opponentSide, raw, entries);
      log(entries, "ATTACK", {
        side,
        targetSide: opponentSide,
        amount: dealt,
        health: state.combatants[opponentSide].health,
      });
      addResolve(state, side, COMBAT.RESOLVE_ON_ATTACK, entries);
      break;
    }
    case ACTIONS.DEFEND: {
      actor.defending = true;
      log(entries, "DEFEND", { side });
      break;
    }
    case ACTIONS.BREAK: {
      assertSupported(state, type);

      const target = state.combatants[opponentSide];
      const guardBroken = target.defending;

      if (guardBroken) {
        target.defending = false;
        log(entries, "GUARD_BROKEN", { side: opponentSide });
      }

      const multiplier = guardBroken
        ? COMBAT.BREAK_GUARDED_MULTIPLIER
        : COMBAT.BREAK_UNGUARDED_MULTIPLIER;
      const raw = boostDirectDamage(
        state,
        side,
        opponentSide,
        ACTIONS.BREAK,
        actor.derived.basicDamage * multiplier,
        entries,
      );
      const dealt = applyDamage(state, opponentSide, raw, entries);

      log(entries, "BREAK", {
        side,
        targetSide: opponentSide,
        amount: dealt,
        guardBroken,
        health: state.combatants[opponentSide].health,
      });
      addResolve(state, side, COMBAT.RESOLVE_ON_BREAK, entries);

      if (guardBroken) {
        applyCharge(state, opponentSide, STATUS_KEYS.EXPOSED, entries);
      }
      break;
    }
    case ACTIONS.SURGE: {
      assertSupported(state, type);

      if (clampResolve(actor.resolve) < COMBAT.SURGE_COST) {
        throw new CombatError(
          `Surge needs ${COMBAT.SURGE_COST} Resolve`,
          "INSUFFICIENT_RESOLVE",
        );
      }

      spendResolve(state, side, COMBAT.SURGE_COST, entries);

      const raw = boostDirectDamage(
        state,
        side,
        opponentSide,
        ACTIONS.SURGE,
        actor.derived.basicDamage * COMBAT.SURGE_MULTIPLIER,
        entries,
      );
      const dealt = applyDamage(state, opponentSide, raw, entries);

      log(entries, "SURGE", {
        side,
        targetSide: opponentSide,
        amount: dealt,
        health: state.combatants[opponentSide].health,
      });
      break;
    }
    case ACTIONS.CAST: {
      resolveSpell(state, side, spellKey, entries);
      break;
    }
    case ACTIONS.FORFEIT: {
      const finished = finish(state, opponentSide, entries);
      finished.log = [...finished.log, ...entries];
      log(entries, "FORFEIT", { side });
      return { state: finished, entries };
    }
    default:
      throw new CombatError("Unknown action", "UNKNOWN_ACTION");
  }

  tickCooldowns(state, side);

  if (state.combatants[opponentSide].health <= 0) {
    const finished = finish(state, side, entries);
    finished.log = [...finished.log, ...entries];
    return { state: finished, entries };
  }

  if (state.turn >= COMBAT.MAX_TURNS) {
    const leader = state.combatants[SIDES.PLAYER].health >= state.combatants[SIDES.OPPONENT].health
      ? SIDES.PLAYER
      : SIDES.OPPONENT;
    const finished = finish(state, leader, entries);
    finished.log = [...finished.log, ...entries];
    return { state: finished, entries };
  }

  const advanced = startNextTurn(consumeGauge(state, side), entries);
  advanced.state.log = [...advanced.state.log, ...entries];

  return { state: advanced.state, entries };
}

function consumeGauge(state, side) {
  writeGauges(state, consumeTurn(gaugeActors(state), side));
  return state;
}

function describeSpellForBattle(state, combatant, spellKey) {
  const spell = findSpell(spellKey);
  if (!spell) return null;

  const tactics = supportsTactics(state);
  const effect = resolveSpellEffect(spell, combatant.stats, { tactics });
  const cooldownRemaining = tactics ? remainingCooldown(combatant, spellKey) : 0;
  const affordable = combatant.mana >= spell.manaCost;

  return {
    key: spell.key,
    name: spell.name,
    target: spell.target,
    manaCost: spell.manaCost,
    cooldownTurns: tactics ? spell.cooldownTurns : null,
    cooldownRemaining,
    preview: previewSentence(effect),
    available: affordable && cooldownRemaining === 0,
    reason: cooldownRemaining > 0
      ? `${cooldownRemaining} ${cooldownRemaining === 1 ? "turn" : "turns"}`
      : affordable
        ? null
        : `Needs ${spell.manaCost} mana`,
  };
}

function previewSentence(effect) {
  switch (effect.type) {
    case "HEAL": return `Recovers ${effect.amount} health.`;
    case "SHIELD": return `Absorbs the next ${effect.amount} damage.`;
    case "DAMAGE": return `Deals ${effect.amount} damage.`;
    case "STRIP_GUARD": return `Deals ${effect.damage} damage and removes their guard.`;
    case "SLOW": return `Pushes them ${effect.gauge} back on the gauge.`;
    case "BURN": return `Deals ${effect.damage} at the start of each of their next ${effect.turns} turns.`;
    case "RESTORE": return `Recovers ${effect.health} health and ${effect.gauge} gauge.`;
    default: return "";
  }
}

export function toBattleView(state) {
  const resolveEnabled = supportsResolve(state);
  const tactics = supportsTactics(state);
  const view = (side) => {
    const combatant = state.combatants[side];

    return {
      side,
      name: combatant.name,
      stats: combatant.stats,
      health: combatant.health,
      maxHealth: combatant.derived.maxHealth,
      mana: combatant.mana,
      maxMana: combatant.derived.maxMana,
      speed: combatant.derived.speed,
      basicDamage: combatant.derived.basicDamage,
      defending: combatant.defending,
      resolve: resolveEnabled ? clampResolve(combatant.resolve) : null,
      maxResolve: resolveEnabled ? COMBAT.RESOLVE_MAX : null,
      shield: combatant.shield,
      burnTurns: combatant.burn?.turns || 0,
      spellKeys: combatant.spellKeys,
      statuses: describeStatuses(combatant, { tactics }),
      spells: (combatant.spellKeys || [])
        .map((key) => describeSpellForBattle(state, combatant, key))
        .filter(Boolean),
    };
  };

  return {
    status: state.status,
    winner: state.winner,
    turn: state.turn,
    activeSide: state.activeSide,
    formulaVersion: getFormulaVersion(state),
    supportedActions: getSupportedActions(state),
    surgeCost: resolveEnabled ? COMBAT.SURGE_COST : null,
    player: view(SIDES.PLAYER),
    opponent: view(SIDES.OPPONENT),
    projectedOrder: state.status === "ACTIVE" ? projectTurnOrder(gaugeActors(state)) : [],
    log: state.log,
  };
}
