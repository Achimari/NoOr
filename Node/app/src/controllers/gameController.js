import { confirmBaseAllocation, getCharacter } from "../services/progressionService.js";
import {
  getOwnProfile,
  getPublicProfile,
  getTodayActivity,
} from "../services/profileService.js";
import { updateGameProfilePresentation } from "../repositories/gameProfileRepository.js";
import { describeCatalog } from "../domain/spells.js";

export async function getGameMe(req, res) {
  const character = await getCharacter(req.user.id);

  return res.json({
    game: {
      stats: character.totals,
      base: character.base,
      earned: character.earned,
      derived: character.derived,
      rating: character.rating,
      allocation: character.allocation,
      spells: {
        unlockedCount: character.spellKeys.length,
        keys: character.spellKeys,
      },
    },
  });
}

export async function patchGameProfile(req, res) {
  await updateGameProfilePresentation({ userId: req.user.id, data: req.validatedBody });
  const profile = await getOwnProfile(req.user.id);

  return res.json({ profile });
}

export async function postAllocation(req, res) {
  const character = await confirmBaseAllocation(req.user.id, req.validatedBody);

  return res.json({
    game: {
      stats: character.totals,
      allocation: character.allocation,
      derived: character.derived,
    },
  });
}

export async function getProfileApi(req, res) {
  const profile = await getPublicProfile(req.user.id, req.params.id);

  return res.json({ profile });
}

export async function getProfileTodayApi(req, res) {
  const today = await getTodayActivity(req.user.id, req.params.id);

  return res.json({ today });
}

export async function getSpellsApi(req, res) {
  const character = await getCharacter(req.user.id);

  return res.json({
    wisdom: character.totals.wisdom,
    intelligence: character.totals.intelligence,
    maxMana: character.derived.maxMana,
    unlockedCount: character.spellKeys.length,
    spells: describeCatalog({ wisdom: character.totals.wisdom, unlockedKeys: character.spellKeys }),
  });
}
