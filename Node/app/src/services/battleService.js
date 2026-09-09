import {
  ACTIONS,
  CombatError,
  SIDES,
  applyAction,
  createBattleState,
} from "../domain/combat.js";
import {
  buildBossSnapshot,
  commitBossIntent,
  findEncounter,
  runBossTurns,
  ENCOUNTERS,
} from "../domain/bosses.js";
import { participantSideFor, toClientBattle } from "../domain/battleDto.js";
import { buildCharacterSnapshot } from "../domain/stats.js";
import { FORMULA_VERSION, PVP } from "../domain/constants.js";
import {
  commitAction,
  completeBattleAsTimedOut,
  createBattle,
  findActionByIdempotencyKey,
  findActiveBattleForUser,
  findActivePveBattle,
  findBattleById,
} from "../repositories/battleRepository.js";
import { lockAllocation } from "../repositories/gameProfileRepository.js";
import { findPveProgress, upsertPveProgress } from "../repositories/pveProgressRepository.js";
import { getCharacter } from "./progressionService.js";
import { findAuthName } from "../repositories/profileRepository.js";
import { AppError } from "../utils/appError.js";

export function toAppError(error) {
  if (error instanceof CombatError) {
    const conflict = [
      "OUT_OF_TURN",
      "BATTLE_COMPLETED",
      "SPELL_LOCKED",
      "INSUFFICIENT_MANA",
      "INSUFFICIENT_RESOLVE",
      "SPELL_ON_COOLDOWN",
    ].includes(error.code);

    return new AppError(error.message, conflict ? 409 : 422, error.code);
  }

  return error;
}

function assertParticipant(battle, userId) {
  const side = participantSideFor(battle, userId);
  if (!side) {
    throw new AppError("Battle not found", 404);
  }

  return side;
}

function winnerUserIdFor(battle, state) {
  if (!state.winner) return null;
  const participant = battle.participants.find((row) => row.side === state.winner);

  return participant?.userId ?? null;
}

function participantResultsFor(state) {
  if (!state.winner) return [];

  return [SIDES.PLAYER, SIDES.OPPONENT].map((side) => ({
    side,
    result: side === state.winner ? "WIN" : "LOSS",
  }));
}

async function buildPlayerSnapshot(userId) {
  const [character, auth] = await Promise.all([getCharacter(userId), findAuthName(userId)]);

  if (!character.allocation.confirmed) {
    throw new AppError("Set your ten base points on My Profile before entering a battle", 409);
  }

  return {
    character,
    snapshot: buildCharacterSnapshot({
      id: userId,
      name: auth?.name || null,
      totals: character.totals,
      unlockedSpellKeys: character.spellKeys,
      equippedSpellKeys: character.equippedSpellKeys,
    }),
  };
}

export async function getPveOverview(userId) {
  const [character, progress, activeBattle] = await Promise.all([
    getCharacter(userId),
    findPveProgress(userId),
    findActiveBattleForUser(userId, "PVE"),
  ]);

  const progressByKey = new Map(progress.map((row) => [row.encounterKey, row]));
  let previousCompleted = true;

  const encounters = ENCOUNTERS.map((encounter) => {
    const row = progressByKey.get(encounter.key);
    const completed = row?.status === "COMPLETED";
    const unlocked = previousCompleted;
    previousCompleted = completed;

    return {
      key: encounter.key,
      order: encounter.order,
      name: encounter.name,
      blurb: encounter.blurb,
      completed,
      unlocked,
      bestTurns: row?.bestTurns ?? null,
      isActive: activeBattle?.encounterKey === encounter.key,
    };
  });

  return {
    encounters,
    activeBattleId: activeBattle?.id || null,
    allocation: character.allocation,
  };
}

export async function startPveEncounter(userId, encounterKey) {
  const encounter = findEncounter(encounterKey);
  if (!encounter) {
    throw new AppError("That trial does not exist", 422);
  }

  const existing = await findActivePveBattle({ userId, encounterKey });
  if (existing) {
    return existing;
  }

  const overview = await getPveOverview(userId);
  const target = overview.encounters.find((item) => item.key === encounterKey);
  if (!target?.unlocked) {
    throw new AppError("Finish the previous trial first", 409);
  }

  const { character, snapshot } = await buildPlayerSnapshot(userId);
  const bossSnapshot = buildBossSnapshot(character.rating, encounter, {
    playerSpeed: snapshot.derived.speed,
  });
  let state = createBattleState({
    playerSnapshot: snapshot,
    opponentSnapshot: bossSnapshot,
    encounterKey,
  });
  state.bossPattern = bossSnapshot.pattern;
  state.bossTurn = 0;
  state = commitBossIntent(state, []).state;

  if (state.activeSide === SIDES.OPPONENT) {
    state = runBossTurns(state).state;
  }

  const battle = await createBattle({
    mode: "PVE",
    encounterKey,
    formulaVersion: FORMULA_VERSION,
    state,
    participants: [
      { userId, side: SIDES.PLAYER, characterSnapshot: snapshot, spellSnapshot: snapshot.spellKeys },
      { userId: null, side: SIDES.OPPONENT, isBoss: true, characterSnapshot: bossSnapshot, spellSnapshot: [] },
    ],
  });

  await lockAllocation(userId);

  return battle;
}

export async function performAction(userId, battleId, { type, spellKey, expectedVersion, idempotencyKey }) {
  const battle = await findBattleById(battleId);
  if (!battle) {
    throw new AppError("Battle not found", 404);
  }

  const side = assertParticipant(battle, userId);

  const replay = await findActionByIdempotencyKey({ battleId: battle.id, idempotencyKey });
  if (replay) {
    return { battle: toClientBattle(battle, userId), replayed: true };
  }

  if (battle.status !== "ACTIVE") {
    throw new AppError("This battle is already finished", 409);
  }

  if (Number(expectedVersion) !== battle.version) {
    throw new AppError("This battle moved on. Refreshing to the latest state.", 409);
  }

  let resolved;
  try {
    resolved = applyAction(battle.state, { side, type, spellKey });
  } catch (error) {
    throw toAppError(error);
  }

  let state = resolved.state;
  let entries = resolved.entries;

  if (battle.mode === "PVE" && state.status === "ACTIVE") {
    const bossResult = runBossTurns(state);
    state = bossResult.state;
    entries = [...entries, ...bossResult.entries];
  }

  const winnerUserId = winnerUserIdFor(battle, state);
  const committed = await commitAction({
    battleId: battle.id,
    expectedVersion: battle.version,
    idempotencyKey,
    actorSide: side,
    actionType: type,
    payload: { type, spellKey: spellKey || null },
    result: { entries },
    state,
    status: state.status,
    winnerUserId,
    participantResults: participantResultsFor(state),
  });

  if (!committed.applied) {
    throw new AppError("This battle moved on. Refreshing to the latest state.", 409);
  }

  if (battle.mode === "PVE" && state.status === "COMPLETED") {
    await upsertPveProgress({
      userId,
      encounterKey: battle.encounterKey,
      completed: state.winner === side,
      turns: state.turn,
    });
  }

  const updated = await findBattleById(battle.id);

  return { battle: toClientBattle(updated, userId), replayed: false };
}

export async function getBattleForUser(userId, battleId) {
  let battle = await findBattleById(battleId);
  if (!battle) {
    throw new AppError("Battle not found", 404);
  }

  assertParticipant(battle, userId);

  if (battle.mode === "PVP" && battle.status === "ACTIVE") {
    const idleMs = Date.now() - new Date(battle.lastActionAt).getTime();

    if (idleMs > PVP.ACTION_TIMEOUT_MS) {
      const state = structuredClone(battle.state);
      const timedOutSide = state.activeSide;
      const winnerSide = timedOutSide === SIDES.PLAYER ? SIDES.OPPONENT : SIDES.PLAYER;

      state.status = "COMPLETED";
      state.winner = winnerSide;
      state.activeSide = null;
      state.log = [...state.log, { code: "TIMEOUT", side: timedOutSide, winner: winnerSide }];

      await completeBattleAsTimedOut({
        battleId: battle.id,
        expectedVersion: battle.version,
        state,
        winnerUserId: winnerUserIdFor(battle, state),
      });

      battle = await findBattleById(battle.id);
    }
  }

  return toClientBattle(battle, userId);
}

export async function forfeitBattle(userId, battleId, idempotencyKey) {
  const battle = await findBattleById(battleId);
  if (!battle) throw new AppError("Battle not found", 404);
  assertParticipant(battle, userId);

  return performAction(userId, battleId, {
    type: ACTIONS.FORFEIT,
    expectedVersion: battle.version,
    idempotencyKey,
  });
}

export { SIDES, toClientBattle };
