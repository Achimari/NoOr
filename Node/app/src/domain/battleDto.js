import { SIDES, toBattleView } from "./combat.js";
import { getBossIntent, toPublicIntent } from "./bosses.js";

export function participantSideFor(battle, userId) {
  const participant = battle.participants.find((row) => row.userId === userId);

  return participant?.side || null;
}

export function toClientBattle(battle, userId) {
  const side = participantSideFor(battle, userId);
  const view = toBattleView(battle.state);
  const isPlayerSide = side === SIDES.PLAYER;

  const you = isPlayerSide ? view.player : view.opponent;
  const { spells: _opponentSpells, ...them } = isPlayerSide ? view.opponent : view.player;

  return {
    id: battle.id,
    mode: battle.mode,
    status: battle.status,
    version: battle.version,
    encounterKey: battle.encounterKey,
    formulaVersion: view.formulaVersion,
    supportedActions: view.supportedActions,
    surgeCost: view.surgeCost,
    yourSide: side,
    isYourTurn: battle.status === "ACTIVE" && view.activeSide === side,
    outcome: battle.status === "COMPLETED"
      ? (view.winner === side ? "WIN" : "LOSS")
      : null,
    turn: view.turn,
    you,
    them,
    nextOpponentIntent: battle.mode === "PVE" && isPlayerSide
      ? toPublicIntent(getBossIntent(battle.state))
      : null,
    projectedOrder: view.projectedOrder.map((entry) => (entry === side ? "YOU" : "THEM")),
    log: view.log,
  };
}
