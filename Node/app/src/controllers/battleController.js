import {
  forfeitBattle,
  getBattleForUser,
  getPveOverview,
  performAction,
  startPveEncounter,
  toClientBattle,
} from "../services/battleService.js";
import { joinQueue, leaveQueue, pollQueue } from "../services/matchmakingService.js";
import { getCharacter } from "../services/progressionService.js";

export async function renderBattlePage(req, res) {
  const [character, pve] = await Promise.all([
    getCharacter(req.user.id),
    getPveOverview(req.user.id),
  ]);

  return res.render("pages/battle", {
    pageId: "battle",
    title: "Battle",
    character: {
      stats: character.totals,
      derived: character.derived,
      rating: character.rating,
      allocation: character.allocation,
      spellCount: character.spellKeys.length,
    },
    pve,
  });
}

export async function getBattleApi(req, res) {
  const battle = await getBattleForUser(req.user.id, req.params.id);

  return res.json({ battle });
}

export async function postBattleAction(req, res) {
  const result = await performAction(req.user.id, req.params.id, req.validatedBody);

  return res.json(result);
}

export async function postBattleForfeit(req, res) {
  const result = await forfeitBattle(req.user.id, req.params.id, req.validatedBody.idempotencyKey);

  return res.json(result);
}

export async function postPveStart(req, res) {
  const battle = await startPveEncounter(req.user.id, req.params.encounterKey);

  return res.json({ battle: toClientBattle(battle, req.user.id) });
}

export async function getPveEncountersApi(req, res) {
  const pve = await getPveOverview(req.user.id);

  return res.json({ pve });
}

export async function postQueue(req, res) {
  return res.json({ queue: await joinQueue(req.user.id) });
}

export async function getQueue(req, res) {
  return res.json({ queue: await pollQueue(req.user.id) });
}

export async function deleteQueue(req, res) {
  return res.json({ queue: await leaveQueue(req.user.id) });
}
