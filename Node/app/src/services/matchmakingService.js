import { PVP, PVP_FORMULA_VERSION } from "../domain/constants.js";
import { SIDES, createBattleState } from "../domain/combat.js";
import { buildCharacterSnapshot } from "../domain/stats.js";
import {
  attachBattleToEntries,
  cancelQueueEntry,
  claimPair,
  createQueueEntry,
  expireStaleEntries,
  findActiveQueueEntry,
  findCandidates,
  findQueueEntryById,
} from "../repositories/matchQueueRepository.js";
import { createBattle, findActiveBattleForUser } from "../repositories/battleRepository.js";
import { lockAllocation } from "../repositories/gameProfileRepository.js";
import { getCharacter } from "./progressionService.js";
import { findAuthName } from "../repositories/profileRepository.js";
import { AppError } from "../utils/appError.js";

export function getRatingBand(rating, waitedMs) {
  const steps = Math.floor(Math.max(0, waitedMs) / PVP.BAND_STEP_MS);
  const band = Math.min(PVP.INITIAL_BAND + steps * PVP.BAND_STEP, PVP.MAX_BAND);
  const spread = Math.max(25, Math.round(rating * band));

  return { band, minRating: rating - spread, maxRating: rating + spread };
}

async function buildSnapshotFor(userId) {
  const [character, auth] = await Promise.all([getCharacter(userId), findAuthName(userId)]);

  return buildCharacterSnapshot({
    id: userId,
    name: auth?.name || null,
    totals: character.totals,
    unlockedSpellKeys: character.spellKeys,
    equippedSpellKeys: character.equippedSpellKeys,
  });
}

export async function getQueueStatus(userId) {
  await expireStaleEntries();

  const activeBattle = await findActiveBattleForUser(userId, "PVP");
  if (activeBattle) {
    return { state: "MATCHED", battleId: activeBattle.id };
  }

  const entry = await findActiveQueueEntry(userId);
  if (entry?.status === "SEARCHING") {
    return {
      state: "SEARCHING",
      queueId: entry.id,
      waitedMs: Date.now() - new Date(entry.createdAt).getTime(),
      expiresAt: entry.expiresAt,
    };
  }

  return { state: "IDLE" };
}

export async function joinQueue(userId) {
  await expireStaleEntries();

  const character = await getCharacter(userId);
  if (!character.allocation.confirmed) {
    throw new AppError("Set your ten base points on My Profile before sparring", 409);
  }

  const activeBattle = await findActiveBattleForUser(userId, "PVP");
  if (activeBattle) {
    return { state: "MATCHED", battleId: activeBattle.id };
  }

  const existing = await findActiveQueueEntry(userId);
  const entry = existing?.status === "SEARCHING"
    ? existing
    : await createQueueEntry({
        userId,
        rating: character.rating,
        expiresAt: new Date(Date.now() + PVP.QUEUE_TTL_MS),
      });

  const matched = await tryMatch(userId, entry);
  if (matched) {
    return { state: "MATCHED", battleId: matched.id };
  }

  return { state: "SEARCHING", queueId: entry.id, waitedMs: 0 };
}

export async function tryMatch(userId, entry) {
  const current = entry || (await findActiveQueueEntry(userId));
  if (!current || current.status !== "SEARCHING") return null;

  const waitedMs = Date.now() - new Date(current.createdAt).getTime();
  const { minRating, maxRating } = getRatingBand(current.rating, waitedMs);
  const candidates = await findCandidates({ userId, minRating, maxRating });

  for (const candidate of candidates) {
    if (candidate.userId === userId) continue;

    const { claimed } = await claimPair({ selfUserId: userId, opponentUserId: candidate.userId });
    if (!claimed) continue;

    const battle = await createPvpBattle(userId, candidate.userId);
    await attachBattleToEntries({ userIds: [userId, candidate.userId], battleId: battle.id });

    return battle;
  }

  return null;
}

async function createPvpBattle(firstUserId, secondUserId) {
  const [playerSnapshot, opponentSnapshot] = await Promise.all([
    buildSnapshotFor(firstUserId),
    buildSnapshotFor(secondUserId),
  ]);

  const state = createBattleState({
    playerSnapshot,
    opponentSnapshot,
    formulaVersion: PVP_FORMULA_VERSION,
  });

  const battle = await createBattle({
    mode: "PVP",
    formulaVersion: PVP_FORMULA_VERSION,
    state,
    participants: [
      { userId: firstUserId, side: SIDES.PLAYER, characterSnapshot: playerSnapshot, spellSnapshot: playerSnapshot.spellKeys },
      { userId: secondUserId, side: SIDES.OPPONENT, characterSnapshot: opponentSnapshot, spellSnapshot: opponentSnapshot.spellKeys },
    ],
  });

  await Promise.all([lockAllocation(firstUserId), lockAllocation(secondUserId)]);

  return battle;
}

export async function leaveQueue(userId) {
  const cancelled = await cancelQueueEntry(userId);

  return { state: "IDLE", cancelled };
}

export async function pollQueue(userId) {
  const status = await getQueueStatus(userId);
  if (status.state !== "SEARCHING") return status;

  const matched = await tryMatch(userId);
  if (matched) {
    return { state: "MATCHED", battleId: matched.id };
  }

  const entry = await findQueueEntryById(status.queueId);
  if (!entry || entry.status !== "SEARCHING") {
    return entry?.status === "EXPIRED" ? { state: "TIMED_OUT" } : { state: "IDLE" };
  }

  return status;
}
