import { getCombatRating, getDerived } from "./stats.js";
import { COMBAT } from "./constants.js";
import {
  ACTIONS,
  SIDES,
  applyAction,
  clampResolve,
  getSupportedActions,
  remainingCooldown,
  supportsTactics,
} from "./combat.js";
import {
  FALLBACK_DESCRIPTOR,
  THE_DISCOURAGEMENT_PHASES,
  THE_DISTRACTION_PHASES,
  THE_DOUBT_PHASES,
  descriptorAt,
  selectPhase,
} from "./bossPhases.js";
import { findSpell, getLoadoutPower, resolveSpellEffect } from "./spells.js";

export const ENCOUNTERS = [
  {
    key: "the-doubt",
    order: 1,
    name: "The Doubt",
    blurb: "The quiet voice that says none of this counts.",
    pattern: ["ATTACK", "ATTACK", "DEFEND", "BREAK"],
    margin: 0.05,
    minRating: 150,
    maxRating: 420,
    weights: { strength: 0.4, dexterity: 0.3, intelligence: 0.3 },
    phases: THE_DOUBT_PHASES,
    spellKeys: [],
  },
  {
    key: "the-distraction",
    order: 2,
    name: "The Distraction",
    blurb: "Everything that is easier than the thing you meant to do.",
    pattern: ["ATTACK", "BREAK", "ATTACK", "ATTACK", "BREAK"],
    margin: 0.08,
    minRating: 260,
    maxRating: 620,
    weights: { strength: 0.36, dexterity: 0.34, intelligence: 0.3 },
    phases: THE_DISTRACTION_PHASES,
    spellKeys: ["still-water"],
  },
  {
    key: "the-discouragement",
    order: 3,
    name: "The Discouragement",
    blurb: "The weight that settles after a day you would rather forget.",
    pattern: ["ATTACK", "ATTACK", "ATTACK", "DEFEND", "SURGE", "DEFEND"],
    margin: 0.12,
    minRating: 380,
    maxRating: 900,
    weights: { strength: 0.5, dexterity: 0.2, intelligence: 0.3 },
    phases: THE_DISCOURAGEMENT_PHASES,
    spellKeys: ["quiet-resolve", "kindled-lamp"],
  },
];

const encounterByKey = new Map(ENCOUNTERS.map((encounter) => [encounter.key, encounter]));

export function findEncounter(key) {
  return encounterByKey.get(key) || null;
}

export function clampBossRating(playerRating, encounter) {
  const target = playerRating * (1 + encounter.margin);

  return Math.round(Math.min(Math.max(target, encounter.minRating), encounter.maxRating));
}

export function scaleBoss(playerRating, encounter, { playerSpeed = null } = {}) {
  const targetRating = clampBossRating(playerRating, encounter);
  const spellPower = getLoadoutPower(encounter.spellKeys || []);
  let best = null;

  for (let points = 0; points <= 400; points += 1) {
    const stats = {
      strength: Math.round(points * encounter.weights.strength),
      dexterity: Math.max(1, Math.round(points * encounter.weights.dexterity)),
      intelligence: Math.round(points * encounter.weights.intelligence),
      wisdom: 0,
    };
    const rating = getCombatRating(getDerived(stats), spellPower);
    const distance = Math.abs(rating - targetRating);

    if (!best || distance < best.distance) {
      best = { stats, rating, distance };
    }
    if (rating > targetRating && best.distance <= distance) break;
  }

  const stats = playerSpeed
    ? { ...best.stats, dexterity: Math.min(best.stats.dexterity, Math.max(1, Math.round(playerSpeed * COMBAT.BOSS_SPEED_RATIO_CAP))) }
    : best.stats;

  return {
    encounterKey: encounter.key,
    name: encounter.name,
    targetRating,
    stats,
    rating: getCombatRating(getDerived(stats), spellPower),
    pattern: [...encounter.pattern],
  };
}

export function getBossAction(pattern, turnIndex) {
  return pattern[turnIndex % pattern.length];
}

export function chooseBossAction(state) {
  const pattern = state?.bossPattern?.length ? state.bossPattern : [ACTIONS.ATTACK];
  const desired = getBossAction(pattern, state?.bossTurn || 0);
  const boss = state?.combatants?.[SIDES.OPPONENT];

  if (!getSupportedActions(state).includes(desired)) {
    return ACTIONS.ATTACK;
  }
  if (desired === ACTIONS.SURGE && clampResolve(boss?.resolve) < COMBAT.SURGE_COST) {
    return ACTIONS.ATTACK;
  }

  return desired;
}

function isDescriptorLegal(state, descriptor) {
  const boss = state.combatants[SIDES.OPPONENT];

  if (!getSupportedActions(state).includes(descriptor.action)) return false;
  if (descriptor.action === ACTIONS.SURGE) {
    return clampResolve(boss.resolve) >= COMBAT.SURGE_COST;
  }
  if (descriptor.action !== ACTIONS.CAST) return true;

  const spell = findSpell(descriptor.spellKey);

  return Boolean(spell)
    && (boss.spellKeys || []).includes(descriptor.spellKey)
    && boss.mana >= spell.manaCost
    && remainingCooldown(boss, descriptor.spellKey) === 0;
}

function previewFor(state, descriptor) {
  const boss = state.combatants[SIDES.OPPONENT];
  const damage = boss.derived.basicDamage;

  switch (descriptor.action) {
    case ACTIONS.ATTACK:
      return { estimatedDamage: damage, effectSummary: null };
    case ACTIONS.BREAK:
      return {
        estimatedDamage: Math.round(damage * COMBAT.BREAK_UNGUARDED_MULTIPLIER),
        effectSummary: "Stronger against a guard.",
      };
    case ACTIONS.SURGE:
      return { estimatedDamage: Math.round(damage * COMBAT.SURGE_MULTIPLIER), effectSummary: null };
    case ACTIONS.DEFEND:
      return { estimatedDamage: null, effectSummary: "Halves the next hit it takes." };
    case ACTIONS.CAST: {
      const spell = findSpell(descriptor.spellKey);
      if (!spell) return { estimatedDamage: null, effectSummary: null };

      const effect = resolveSpellEffect(spell, boss.stats, { tactics: supportsTactics(state) });

      switch (effect.type) {
        case "DAMAGE":
          return { estimatedDamage: effect.amount, effectSummary: null };
        case "STRIP_GUARD":
          return { estimatedDamage: effect.damage, effectSummary: "Removes your guard." };
        case "BURN":
          return {
            estimatedDamage: null,
            effectSummary: `${effect.damage} at the start of each of your next ${effect.turns} turns.`,
          };
        case "SHIELD":
          return { estimatedDamage: null, effectSummary: `Absorbs the next ${effect.amount} damage.` };
        case "SLOW":
          return { estimatedDamage: null, effectSummary: `Pushes you ${effect.gauge} back on the gauge.` };
        case "HEAL":
          return { estimatedDamage: null, effectSummary: `Recovers ${effect.amount} health.` };
        case "RESTORE":
          return { estimatedDamage: null, effectSummary: `Recovers ${effect.health} health and ${effect.gauge} gauge.` };
        default:
          return { estimatedDamage: null, effectSummary: null };
      }
    }
    default:
      return { estimatedDamage: null, effectSummary: null };
  }
}

function toIntent(state, descriptor, phaseKey) {
  const { estimatedDamage, effectSummary } = previewFor(state, descriptor);

  return {
    action: descriptor.action,
    spellKey: descriptor.spellKey || null,
    label: descriptor.label,
    severity: descriptor.severity,
    estimatedDamage,
    effectSummary,
    counter: descriptor.counter,
    phase: phaseKey,
  };
}

export function commitBossIntent(state, entries = [], { force = false } = {}) {
  if (!state || state.status !== "ACTIVE") return { state, entries };

  const encounter = findEncounter(state.encounterKey);
  if (!supportsTactics(state) || !encounter?.phases?.length) {
    return { state: { ...state, bossIntent: state.bossIntent || chooseBossAction(state) }, entries };
  }

  if (state.bossIntent && typeof state.bossIntent === "object" && !force) {
    return { state, entries };
  }

  const boss = state.combatants[SIDES.OPPONENT];
  const ratio = boss.derived.maxHealth > 0 ? boss.health / boss.derived.maxHealth : 1;
  const phase = selectPhase(encounter, ratio);

  const working = { ...state };
  if (working.bossPhase !== phase.key) {
    if (working.bossPhase) {
      const entry = { code: "PHASE_CHANGE", side: SIDES.OPPONENT, phase: phase.key };
      entries.push(entry);
      working.log = [...(working.log || []), entry];
    }

    working.bossPhase = phase.key;
    working.bossPhaseTurn = 0;
  }

  const cycle = Number.isInteger(working.bossPhaseTurn) ? working.bossPhaseTurn : 0;
  const desired = descriptorAt(phase, cycle);
  const descriptor = isDescriptorLegal(working, desired) ? desired : FALLBACK_DESCRIPTOR;

  working.bossPhaseTurn = cycle;
  working.bossIntent = toIntent(working, descriptor, phase.key);

  return { state: working, entries };
}

export function getBossIntent(state) {
  if (!state || state.status !== "ACTIVE") return null;

  return state.bossIntent || chooseBossAction(state);
}

export function toPublicIntent(intent) {
  if (!intent || typeof intent === "string") return intent ?? null;

  return {
    action: intent.action,
    spellKey: intent.spellKey ?? null,
    label: intent.label,
    severity: intent.severity,
    estimatedDamage: intent.estimatedDamage ?? null,
    effectSummary: intent.effectSummary ?? null,
    counter: intent.counter,
    phase: intent.phase,
  };
}

export function runBossTurns(state) {
  let working = commitBossIntent({ ...state }, []).state;
  const entries = [];
  let taken = 0;

  while (
    working.status === "ACTIVE"
    && working.activeSide === SIDES.OPPONENT
    && taken < COMBAT.MAX_TURNS
  ) {
    const intent = getBossIntent(working);
    const move = typeof intent === "string" ? intent : intent.action;
    const spellKey = typeof intent === "string" ? null : intent.spellKey;

    const result = applyAction(working, { side: SIDES.OPPONENT, type: move, spellKey });

    working = result.state;
    working.bossTurn = (state.bossTurn || 0) + taken + 1;
    working.bossPhaseTurn = (working.bossPhaseTurn || 0) + 1;
    working.bossIntent = null;

    entries.push(...result.entries);

    const committed = commitBossIntent(working, entries);
    working = committed.state;
    taken += 1;
  }

  return { state: working, entries };
}

export function buildBossSnapshot(playerRating, encounter, { playerSpeed = null } = {}) {
  const scaled = scaleBoss(playerRating, encounter, { playerSpeed });
  const derived = getDerived(scaled.stats);

  return {
    id: null,
    name: encounter.name,
    stats: scaled.stats,
    derived,
    rating: scaled.rating,
    spellKeys: [...(encounter.spellKeys || [])],
    pattern: scaled.pattern,
    encounterKey: encounter.key,
  };
}
