import {
  ALLOCATABLE_STATS,
  BASE_POINT_TOTAL,
  COMBAT,
  RATING_WEIGHTS,
  STATS,
} from "./constants.js";
import { getLoadoutPower } from "./spells.js";

function emptyStatBlock() {
  return Object.fromEntries(STATS.map((stat) => [stat, 0]));
}

export function getTotals(base = {}, rewards = []) {
  const totals = emptyStatBlock();

  for (const stat of ALLOCATABLE_STATS) {
    totals[stat] = Math.max(0, Math.trunc(Number(base[stat]) || 0));
  }

  for (const reward of rewards) {
    if (!reward?.stat || !(reward.stat in totals)) continue;
    totals[reward.stat] += Number.isFinite(reward.amount) ? reward.amount : 1;
  }

  return totals;
}

export function getDerived(totals = {}) {
  const strength = Math.max(0, Math.trunc(Number(totals.strength) || 0));
  const dexterity = Math.max(0, Math.trunc(Number(totals.dexterity) || 0));
  const intelligence = Math.max(0, Math.trunc(Number(totals.intelligence) || 0));

  return {
    maxHealth: COMBAT.BASE_HEALTH + strength * COMBAT.HEALTH_PER_STRENGTH,
    basicDamage: COMBAT.BASE_DAMAGE + strength * COMBAT.DAMAGE_PER_STRENGTH,
    maxMana: COMBAT.BASE_MANA + intelligence * COMBAT.MANA_PER_INTELLIGENCE,
    speed: Math.max(COMBAT.MIN_SPEED, dexterity),
  };
}

export function getCombatRating(derived, spellPower = 0) {
  const spells = Math.max(0, Math.trunc(Number(spellPower) || 0));

  return Math.round(
    derived.maxHealth * RATING_WEIGHTS.HEALTH
      + derived.basicDamage * RATING_WEIGHTS.DAMAGE
      + derived.maxMana * RATING_WEIGHTS.MANA
      + derived.speed * RATING_WEIGHTS.SPEED
      + spells * RATING_WEIGHTS.SPELL,
  );
}

export function validateAllocation(allocation = {}) {
  const values = {};

  for (const stat of ALLOCATABLE_STATS) {
    const raw = allocation[stat];
    const value = Number(raw);

    if (!Number.isInteger(value) || value < 0) {
      return { valid: false, reason: `${stat} must be a whole number of zero or more` };
    }

    values[stat] = value;
  }

  for (const stat of STATS) {
    if (!ALLOCATABLE_STATS.includes(stat) && allocation[stat] !== undefined) {
      return { valid: false, reason: "Wisdom is earned through reflection and cannot be allocated" };
    }
  }

  const sum = ALLOCATABLE_STATS.reduce((total, stat) => total + values[stat], 0);
  if (sum !== BASE_POINT_TOTAL) {
    return { valid: false, reason: `Spend exactly ${BASE_POINT_TOTAL} points (you spent ${sum})` };
  }

  return { valid: true, allocation: values };
}

export function buildCharacterSnapshot({
  totals,
  unlockedSpellKeys = [],
  equippedSpellKeys = null,
  name = null,
  id = null,
}) {
  const derived = getDerived(totals);
  const spellKeys = [...(equippedSpellKeys ?? unlockedSpellKeys)];

  return {
    id,
    name,
    stats: { ...totals },
    derived,
    rating: getCombatRating(derived, getLoadoutPower(spellKeys)),
    spellKeys,
  };
}
