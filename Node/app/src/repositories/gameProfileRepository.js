import { prisma } from "../prisma/client.js";
import { DEFAULT_ACCENT_KEY, DEFAULT_EMBLEM_KEY } from "../domain/constants.js";

const gameProfileSelect = {
  id: true,
  baseStrength: true,
  baseDexterity: true,
  baseIntelligence: true,
  allocationConfirmedAt: true,
  allocationLockedAt: true,
  emblemKey: true,
  accentKey: true,
  shareTodayGoals: true,
  shareTodayBibleReflection: true,
  equippedSpellKeys: true,
};

export async function ensureGameProfile(userId, client = prisma) {
  const existing = await client.gameProfile.findUnique({
    where: { id: userId },
    select: gameProfileSelect,
  });
  if (existing) return existing;

  try {
    return await client.gameProfile.create({
      data: {
        id: userId,
        emblemKey: DEFAULT_EMBLEM_KEY,
        accentKey: DEFAULT_ACCENT_KEY,
      },
      select: gameProfileSelect,
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;

    return client.gameProfile.findUnique({
      where: { id: userId },
      select: gameProfileSelect,
    });
  }
}

export async function confirmAllocation({ userId, allocation }) {
  return prisma.$transaction(async (tx) => {
    await ensureGameProfile(userId, tx);
    const current = await tx.gameProfile.findUnique({
      where: { id: userId },
      select: { allocationLockedAt: true },
    });

    if (current?.allocationLockedAt) {
      return null;
    }

    return tx.gameProfile.update({
      where: { id: userId },
      data: {
        baseStrength: allocation.strength,
        baseDexterity: allocation.dexterity,
        baseIntelligence: allocation.intelligence,
        allocationConfirmedAt: new Date(),
      },
      select: gameProfileSelect,
    });
  });
}

export async function lockAllocation(userId, client = prisma) {
  return client.gameProfile.updateMany({
    where: { id: userId, allocationLockedAt: null },
    data: { allocationLockedAt: new Date() },
  });
}

export async function resetAllocation(userId, client = prisma) {
  await ensureGameProfile(userId, client);

  const result = await client.gameProfile.updateMany({
    where: {
      id: userId,
      user: {
        battleParticipants: { none: { battle: { status: "ACTIVE" } } },
        matchQueueEntries: {
          none: {
            OR: [
              { status: "SEARCHING", expiresAt: { gt: new Date() } },
              { status: "MATCHED", battleId: null },
            ],
          },
        },
      },
    },
    data: {
      baseStrength: 0,
      baseDexterity: 0,
      baseIntelligence: 0,
      allocationConfirmedAt: null,
      allocationLockedAt: null,
    },
  });

  return result.count === 1;
}

export async function updateEquippedSpellKeys({ userId, spellKeys }) {
  await ensureGameProfile(userId);

  return prisma.gameProfile.update({
    where: { id: userId },
    data: { equippedSpellKeys: spellKeys },
    select: gameProfileSelect,
  });
}

export async function updateGameProfilePresentation({ userId, data }) {
  await ensureGameProfile(userId);

  return prisma.gameProfile.update({
    where: { id: userId },
    data,
    select: gameProfileSelect,
  });
}
