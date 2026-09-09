import { prisma } from "../prisma/client.js";

export async function findSpellUnlocks(userId) {
  return prisma.spellUnlock.findMany({
    where: { userId },
    select: { spellKey: true, unlockedAt: true },
    orderBy: { unlockedAt: "asc" },
  });
}

export async function countSpellUnlocks(userId) {
  return prisma.spellUnlock.count({ where: { userId } });
}

export async function createSpellUnlock({ userId, spellKey }) {
  const result = await prisma.spellUnlock.createMany({
    data: [{ userId, spellKey }],
    skipDuplicates: true,
  });

  return result.count === 1;
}
