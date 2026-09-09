import { getExploreState, unlockSpell } from "../services/spellService.js";
import { setLoadout } from "../services/loadoutService.js";

export async function postSpellUnlock(req, res) {
  const result = await unlockSpell(req.user.id, req.params.spellKey);
  const explore = await getExploreState(req.user.id);

  return res.json({ unlock: result, explore });
}

export async function putSpellLoadout(req, res) {
  const loadout = await setLoadout(req.user.id, req.validatedBody.spellKeys);
  const explore = await getExploreState(req.user.id);

  return res.json({ loadout, explore });
}
