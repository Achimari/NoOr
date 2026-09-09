import { EQUIPPED_SPELL_LIMIT } from "./constants.js";
import { isKnownSpell } from "./spells.js";

export function orderUnlockedKeys(unlocks = []) {
  return [...(unlocks || [])]
    .filter((row) => isKnownSpell(row?.spellKey))
    .sort((first, second) => {
      const firstAt = new Date(first.unlockedAt || 0).getTime();
      const secondAt = new Date(second.unlockedAt || 0).getTime();

      return firstAt - secondAt || String(first.spellKey).localeCompare(String(second.spellKey));
    })
    .map((row) => row.spellKey);
}

export function defaultLoadout(unlocks = []) {
  return orderUnlockedKeys(unlocks).slice(0, EQUIPPED_SPELL_LIMIT);
}

export function resolveLoadout({ equippedKeys, unlocks = [] } = {}) {
  const unlocked = new Set(orderUnlockedKeys(unlocks));
  const seen = new Set();
  const resolved = [];

  for (const key of Array.isArray(equippedKeys) ? equippedKeys : []) {
    if (!unlocked.has(key) || seen.has(key)) continue;

    seen.add(key);
    resolved.push(key);
    if (resolved.length === EQUIPPED_SPELL_LIMIT) break;
  }

  return resolved.length ? resolved : defaultLoadout(unlocks);
}

export function validateLoadout({ spellKeys, unlockedKeys = [] } = {}) {
  if (!Array.isArray(spellKeys)) {
    return { valid: false, reason: "Choose which spells to carry" };
  }

  if (spellKeys.length > EQUIPPED_SPELL_LIMIT) {
    return { valid: false, reason: `You can carry three spells into a battle` };
  }

  const unlocked = new Set(unlockedKeys);
  const seen = new Set();

  for (const key of spellKeys) {
    if (!isKnownSpell(key)) {
      return { valid: false, reason: "That spell does not exist" };
    }
    if (!unlocked.has(key)) {
      return { valid: false, reason: "You have not learned that spell yet" };
    }
    if (seen.has(key)) {
      return { valid: false, reason: "Each spell can be carried once" };
    }

    seen.add(key);
  }

  if (!spellKeys.length && unlocked.size > 0) {
    return { valid: false, reason: "Carry at least one spell" };
  }

  return { valid: true, spellKeys: [...spellKeys] };
}
