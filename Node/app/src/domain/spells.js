import { EQUIPPED_SPELL_LIMIT } from "./constants.js";

export const SPELL_TARGETS = { SELF: "SELF", OPPONENT: "OPPONENT" };

export const SPELL_CATALOG = [
  {
    key: "steady-breath",
    name: "Steady Breath",
    wisdomRequired: 1,
    manaCost: 6,
    target: SPELL_TARGETS.SELF,
    effect: { type: "HEAL", amount: 22 },
    summary: "Recover 22 health.",
    tactic: "Cheapest way to survive a long exchange. Best used before you are nearly out of health, not after.",
    cooldownTurns: 2,
    scaling: { amount: { base: 14, stat: "intelligence", per: 2 } },
    power: 1,
  },
  {
    key: "clear-sight",
    name: "Clear Sight",
    wisdomRequired: 2,
    manaCost: 7,
    target: SPELL_TARGETS.OPPONENT,
    effect: { type: "STRIP_GUARD", damage: 10 },
    summary: "Deal 10 damage and remove the opponent's guard.",
    tactic: "The answer to an opponent who defends on a predictable beat.",
    cooldownTurns: 1,
    scaling: { damage: { base: 6, stat: "intelligence", per: 1 } },
    power: 1,
  },
  {
    key: "quiet-resolve",
    name: "Quiet Resolve",
    wisdomRequired: 3,
    manaCost: 8,
    target: SPELL_TARGETS.SELF,
    effect: { type: "SHIELD", amount: 26 },
    summary: "Absorb the next 26 damage.",
    tactic: "Stronger than defending when you expect one heavy hit rather than several small ones.",
    cooldownTurns: 2,
    scaling: { amount: { base: 14, stat: "intelligence", per: 3 } },
    power: 2,
  },
  {
    key: "still-water",
    name: "Still Water",
    wisdomRequired: 4,
    manaCost: 10,
    target: SPELL_TARGETS.OPPONENT,
    effect: { type: "SLOW", gauge: 40 },
    summary: "Push the opponent 40 back on the initiative gauge.",
    tactic: "Buys an extra turn against a faster opponent. Worth more early than late.",
    cooldownTurns: 2,
    scaling: { gauge: { base: 32, stat: "intelligence", per: 2 } },
    power: 2,
  },
  {
    key: "kindled-lamp",
    name: "Kindled Lamp",
    wisdomRequired: 6,
    manaCost: 12,
    target: SPELL_TARGETS.OPPONENT,
    effect: { type: "BURN", damage: 9, turns: 3 },
    summary: "Deal 9 damage at the start of each of the opponent's next 3 turns.",
    tactic: "Total damage beats a basic attack if the battle lasts. Wasted on an opponent about to fall.",
    cooldownTurns: 3,
    scaling: { damage: { base: 5, stat: "intelligence", per: 1 } },
    power: 3,
  },
  {
    key: "dawn-break",
    name: "Dawn Break",
    wisdomRequired: 9,
    manaCost: 16,
    target: SPELL_TARGETS.OPPONENT,
    effect: { type: "DAMAGE", amount: 38 },
    summary: "Deal 38 damage.",
    tactic: "The finisher. Hold the mana for it rather than spending on smaller casts.",
    cooldownTurns: 2,
    scaling: { amount: { base: 22, stat: "intelligence", per: 4 } },
    power: 4,
  },
  {
    key: "second-wind",
    name: "Second Wind",
    wisdomRequired: 12,
    manaCost: 14,
    target: SPELL_TARGETS.SELF,
    effect: { type: "RESTORE", health: 30, gauge: 35 },
    summary: "Recover 30 health and advance 35 on the initiative gauge.",
    tactic: "Turns a losing exchange around by buying health and tempo at once.",
    cooldownTurns: 3,
    scaling: {
      health: { base: 18, stat: "intelligence", per: 3 },
      gauge: { base: 27, stat: "intelligence", per: 2 },
    },
    power: 4,
  },
];

const catalogByKey = new Map(SPELL_CATALOG.map((spell) => [spell.key, spell]));

export function findSpell(spellKey) {
  return catalogByKey.get(spellKey) || null;
}

export function isKnownSpell(spellKey) {
  return catalogByKey.has(spellKey);
}

export function canUnlock(spell, wisdom) {
  return Boolean(spell) && Number(wisdom) >= spell.wisdomRequired;
}

export function describeCatalog({ wisdom = 0, unlockedKeys = [], equippedKeys = [] } = {}) {
  const unlocked = new Set(unlockedKeys);
  const equipped = new Set(equippedKeys);

  return SPELL_CATALOG.map((spell) => ({
    key: spell.key,
    name: spell.name,
    wisdomRequired: spell.wisdomRequired,
    manaCost: spell.manaCost,
    target: spell.target,
    summary: spell.summary,
    tactic: spell.tactic,
    cooldownTurns: spell.cooldownTurns,
    unlocked: unlocked.has(spell.key),
    available: !unlocked.has(spell.key) && canUnlock(spell, wisdom),
    wisdomRemaining: Math.max(0, spell.wisdomRequired - Number(wisdom || 0)),
    equipped: equipped.has(spell.key),
  }));
}

export function resolveSpellEffect(spell, stats = {}, { tactics = false } = {}) {
  if (!tactics || !spell?.scaling) return spell.effect;

  const resolved = { ...spell.effect };

  for (const [field, rule] of Object.entries(spell.scaling)) {
    const stat = Math.max(0, Math.trunc(Number(stats[rule.stat]) || 0));
    resolved[field] = Math.max(0, Math.round(rule.base + stat * rule.per));
  }

  return resolved;
}

export function getLoadoutPower(equippedKeys = []) {
  const seen = new Set();
  let power = 0;

  for (const key of equippedKeys) {
    const spell = findSpell(key);
    if (!spell || seen.has(key)) continue;

    seen.add(key);
    power += spell.power;
  }

  return power;
}

export { EQUIPPED_SPELL_LIMIT };
