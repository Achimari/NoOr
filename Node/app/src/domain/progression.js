import { DEXTERITY_REQUIRED_GOALS, REWARD_SOURCES, STATS } from "./constants.js";
import { getTotals } from "./stats.js";

export function isStrengthEligible(recoveryRow) {
  return recoveryRow?.answer === "YES";
}

export function isIntelligenceEligible(readingRow) {
  return readingRow?.answer === "YES";
}

export function isWisdomEligible(readingRow) {
  return isIntelligenceEligible(readingRow) && String(readingRow?.reflection || "").trim().length > 0;
}

export function isDexterityEligible(goalRows) {
  const rows = goalRows || [];
  if (rows.length !== DEXTERITY_REQUIRED_GOALS) return false;

  return rows.every((goal) => Boolean(goal.completedAt));
}

export function getEligibleRewardsForDate({ recovery, reading, goals }) {
  const eligible = [];

  if (isStrengthEligible(recovery)) {
    eligible.push({ stat: "strength", source: REWARD_SOURCES.RECOVERY });
  }
  if (isDexterityEligible(goals)) {
    eligible.push({ stat: "dexterity", source: REWARD_SOURCES.GOALS });
  }
  if (isIntelligenceEligible(reading)) {
    eligible.push({ stat: "intelligence", source: REWARD_SOURCES.READING });
  }
  if (isWisdomEligible(reading)) {
    eligible.push({ stat: "wisdom", source: REWARD_SOURCES.REFLECTION });
  }

  return eligible;
}

function rewardIdentity(reward) {
  return `${reward.stat}:${reward.source}`;
}

export function diffRewards(existingRewards, eligibleRewards) {
  const existing = new Map((existingRewards || []).map((reward) => [rewardIdentity(reward), reward]));
  const eligible = new Map((eligibleRewards || []).map((reward) => [rewardIdentity(reward), reward]));

  const toCreate = [];
  for (const [identity, reward] of eligible) {
    if (!existing.has(identity)) toCreate.push(reward);
  }

  const toRemove = [];
  for (const [identity, reward] of existing) {
    if (!eligible.has(identity)) toRemove.push(reward);
  }

  return { toCreate, toRemove };
}

export function isRewardInMonth(reward, { startDateKey, endDateKeyExclusive }) {
  const dateKey = String(reward?.dateKey || "");

  return dateKey >= startDateKey && dateKey < endDateKeyExclusive;
}

export function selectRewardsForMonth(rewards, monthRange) {
  return (rewards || []).filter((reward) => isRewardInMonth(reward, monthRange));
}

export function getMonthlyTotals({ base = {}, rewards = [], monthRange }) {
  const monthRewards = selectRewardsForMonth(rewards, monthRange);
  const totals = getTotals(base, monthRewards);
  const baseTotals = getTotals(base, []);

  return {
    monthRewards,
    totals,
    earned: Object.fromEntries(STATS.map((stat) => [stat, totals[stat] - baseTotals[stat]])),
  };
}
