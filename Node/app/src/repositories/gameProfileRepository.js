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

export async function findGameProfile(userId) {
  return prisma.gameProfile.findUnique({
    where: { id: userId },
    select: gameProfileSelect,
  });
}

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
