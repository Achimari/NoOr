import { getEligibleRewardsForDate, diffRewards, getMonthlyTotals } from "../domain/progression.js";
import { getCombatRating, getDerived, validateAllocation } from "../domain/stats.js";
import { resolveLoadout } from "../domain/loadout.js";
import { getLoadoutPower } from "../domain/spells.js";
import {
  confirmAllocation,
  ensureGameProfile,
  findGameProfile,
} from "../repositories/gameProfileRepository.js";
import {
  createRewards,
  deleteRewards,
  findRewardsForDate,
  findRewardsInMonth,
  findSourceDateKeys,
  findSourceRowsForDate,
} from "../repositories/statRewardRepository.js";
import { findSpellUnlocks } from "../repositories/spellUnlockRepository.js";
import { findAuthTimezone } from "../repositories/profileRepository.js";
import { getEffectiveMonthRange } from "../utils/dateKey.js";
import { AppError } from "../utils/appError.js";
import { BASE_POINT_TOTAL } from "../domain/constants.js";

export async function reconcileRewardsForDate(userId, dateKey, client) {
  if (!userId || !dateKey) return { created: 0, removed: 0 };

  const sources = await findSourceRowsForDate({ userId, dateKey }, client);
  const eligible = getEligibleRewardsForDate(sources);
  const existing = await findRewardsForDate({ userId, dateKey }, client);
  const { toCreate, toRemove } = diffRewards(existing, eligible);

  const [created, removed] = await Promise.all([
    createRewards({ userId, dateKey, rewards: toCreate }, client),
    deleteRewards({ userId, dateKey, rewards: toRemove }, client),
  ]);

  return { created, removed };
}

export async function reconcileAllRewards(userId) {
  const dateKeys = await findSourceDateKeys(userId);
  let created = 0;
  let removed = 0;

  for (const dateKey of dateKeys) {
    const result = await reconcileRewardsForDate(userId, dateKey);
    created += result.created;
    removed += result.removed;
  }

  return { dateKeys: dateKeys.length, created, removed };
}

export async function getCharacter(userId, { now = new Date(), timezone } = {}) {
  const zone = timezone ?? (await findAuthTimezone(userId))?.timezone ?? undefined;
  const monthRange = getEffectiveMonthRange(now, zone);

  const [profile, rewards, unlocks] = await Promise.all([
    ensureGameProfile(userId),
    findRewardsInMonth({ userId, ...monthRange }),
    findSpellUnlocks(userId),
  ]);

  const base = {
    strength: profile.baseStrength,
    dexterity: profile.baseDexterity,
    intelligence: profile.baseIntelligence,
  };
  const { totals, earned } = getMonthlyTotals({ base, rewards, monthRange });
  const derived = getDerived(totals);
  const spellKeys = unlocks.map((unlock) => unlock.spellKey);
  const equippedSpellKeys = resolveLoadout({ equippedKeys: profile.equippedSpellKeys, unlocks });

  return {
    profile,
    base,
    totals,
    earned,
    month: monthRange,
    derived,
    rating: getCombatRating(derived, getLoadoutPower(equippedSpellKeys)),
    spellKeys,
    unlocks,
    equippedSpellKeys,
    allocation: {
      total: BASE_POINT_TOTAL,
      confirmed: Boolean(profile.allocationConfirmedAt),
      locked: Boolean(profile.allocationLockedAt),
    },
  };
}

export async function confirmBaseAllocation(userId, allocation) {
  const result = validateAllocation(allocation);
  if (!result.valid) {
    throw new AppError(result.reason, 400);
  }

  const updated = await confirmAllocation({ userId, allocation: result.allocation });
  if (!updated) {
    throw new AppError("Your points are locked because you have already entered a battle", 409);
  }

  return getCharacter(userId);
}
