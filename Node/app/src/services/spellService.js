import { canUnlock, describeCatalog, findSpell } from "../domain/spells.js";
import { EQUIPPED_SPELL_LIMIT } from "../domain/constants.js";
import { countSpellUnlocks, createSpellUnlock, findSpellUnlocks } from "../repositories/spellUnlockRepository.js";
import { getCharacter } from "./progressionService.js";
import { AppError } from "../utils/appError.js";

export async function getExploreState(userId) {
  const character = await getCharacter(userId);
  const spells = describeCatalog({
    wisdom: character.totals.wisdom,
    unlockedKeys: character.spellKeys,
    equippedKeys: character.equippedSpellKeys,
  });

  return {
    month: character.month,
    intelligence: character.totals.intelligence,
    wisdom: character.totals.wisdom,
    maxMana: character.derived.maxMana,
    unlockedCount: character.spellKeys.length,
    equipped: character.equippedSpellKeys,
    equippedLimit: EQUIPPED_SPELL_LIMIT,
    totalCount: spells.length,
    nextSpell: spells.find((spell) => !spell.unlocked) || null,
    allocation: character.allocation,
    spells,
  };
}

export async function unlockSpell(userId, spellKey) {
  const spell = findSpell(spellKey);
  if (!spell) {
    throw new AppError("That spell does not exist", 422);
  }

  const character = await getCharacter(userId);
  if (!character.allocation.confirmed) {
    throw new AppError("Set your ten base points before unlocking spells", 409);
  }

  if (!canUnlock(spell, character.totals.wisdom)) {
    throw new AppError(
      `${spell.name} needs ${spell.wisdomRequired} Wisdom. You have ${character.totals.wisdom} this month.`,
      409,
    );
  }

  const created = await createSpellUnlock({ userId, spellKey });

  return {
    spellKey,
    alreadyUnlocked: !created,
    unlockedCount: await countSpellUnlocks(userId),
  };
}

