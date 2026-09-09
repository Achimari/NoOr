import { prisma } from "../prisma/client.js";

const participantSelect = {
  id: true,
  userId: true,
  side: true,
  isBoss: true,
  characterSnapshot: true,
  spellSnapshot: true,
  result: true,
};

const battleSelect = {
  id: true,
  mode: true,
  status: true,
  version: true,
  formulaVersion: true,
  encounterKey: true,
  winnerUserId: true,
  state: true,
  lastActionAt: true,
  createdAt: true,
  completedAt: true,
  participants: { select: participantSelect },
};

export async function findBattleById(battleId, client = prisma) {
  const id = Number(battleId);
  if (!Number.isInteger(id) || id <= 0) return null;

  return client.battle.findUnique({ where: { id }, select: battleSelect });
}

export async function findActiveBattleForUser(userId, mode) {
  const participant = await prisma.battleParticipant.findFirst({
    where: { userId, battle: { status: "ACTIVE", ...(mode ? { mode } : {}) } },
    select: { battleId: true },
    orderBy: { id: "desc" },
  });
  if (!participant) return null;

  return findBattleById(participant.battleId);
}

export async function findActivePveBattle({ userId, encounterKey }) {
  const participant = await prisma.battleParticipant.findFirst({
    where: { userId, battle: { status: "ACTIVE", mode: "PVE", encounterKey } },
    select: { battleId: true },
    orderBy: { id: "desc" },
  });
  if (!participant) return null;

  return findBattleById(participant.battleId);
}

export async function createBattle({ mode, encounterKey, formulaVersion, state, participants }, client = prisma) {
  const battle = await client.battle.create({
    data: {
      mode,
      encounterKey: encounterKey || null,
      formulaVersion,
      state,
      status: "ACTIVE",
      participants: {
        create: participants.map((participant) => ({
          userId: participant.userId || null,
          side: participant.side,
          isBoss: Boolean(participant.isBoss),
          characterSnapshot: participant.characterSnapshot,
          spellSnapshot: participant.spellSnapshot,
          activePvpUserId: mode === "PVP" && participant.userId ? participant.userId : null,
        })),
      },
    },
    select: battleSelect,
  });

  return battle;
}

export async function commitAction({
  battleId,
  expectedVersion,
  idempotencyKey,
  actorSide,
  actionType,
  payload,
  result,
  state,
  status,
  winnerUserId,
  participantResults,
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.battle.updateMany({
      where: { id: battleId, version: expectedVersion, status: "ACTIVE" },
      data: {
        version: expectedVersion + 1,
        state,
        status,
        winnerUserId: winnerUserId ?? null,
        lastActionAt: new Date(),
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
    });

    if (claimed.count !== 1) {
      return { applied: false };
    }

    const sequence = await tx.battleAction.count({ where: { battleId } });
    await tx.battleAction.create({
      data: {
        battleId,
        sequence,
        actorSide,
        actionType,
        payload,
        result,
        idempotencyKey,
      },
    });

    if (status === "COMPLETED") {
      await tx.battleParticipant.updateMany({
        where: { battleId },
        data: { activePvpUserId: null },
      });

      for (const participantResult of participantResults || []) {
        await tx.battleParticipant.updateMany({
          where: { battleId, side: participantResult.side },
          data: { result: participantResult.result },
        });
      }
    }

    return { applied: true };
  });
}

export async function findActionByIdempotencyKey({ battleId, idempotencyKey }) {
  return prisma.battleAction.findUnique({
    where: { battleId_idempotencyKey: { battleId, idempotencyKey } },
    select: { id: true, sequence: true, actorSide: true, actionType: true, result: true },
  });
}

export async function completeBattleAsTimedOut({ battleId, expectedVersion, state, winnerUserId }) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.battle.updateMany({
      where: { id: battleId, version: expectedVersion, status: "ACTIVE" },
      data: {
        version: expectedVersion + 1,
        state,
        status: "COMPLETED",
        winnerUserId: winnerUserId ?? null,
        completedAt: new Date(),
      },
    });

    if (claimed.count === 1) {
      await tx.battleParticipant.updateMany({ where: { battleId }, data: { activePvpUserId: null } });
    }

    return claimed.count === 1;
  });
}
