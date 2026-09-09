import { EQUIPPED_SPELL_LIMIT } from "../domain/constants.js";
import { resolveLoadout, validateLoadout } from "../domain/loadout.js";
import { updateEquippedSpellKeys } from "../repositories/gameProfileRepository.js";
import { getCharacter } from "./progressionService.js";
import { AppError } from "../utils/appError.js";

export async function getLoadout(userId) {
  const character = await getCharacter(userId);

  return {
    equipped: character.equippedSpellKeys,
    limit: EQUIPPED_SPELL_LIMIT,
    unlockedCount: character.spellKeys.length,
  };
}

export async function setLoadout(userId, spellKeys) {
  const character = await getCharacter(userId);

  const result = validateLoadout({ spellKeys, unlockedKeys: character.spellKeys });
  if (!result.valid) {
    throw new AppError(result.reason, 409, "LOADOUT_INVALID");
  }

  const profile = await updateEquippedSpellKeys({ userId, spellKeys: result.spellKeys });

  return {
    equipped: resolveLoadout({ equippedKeys: profile.equippedSpellKeys, unlocks: character.unlocks }),
    limit: EQUIPPED_SPELL_LIMIT,
    unlockedCount: character.spellKeys.length,
  };
}
