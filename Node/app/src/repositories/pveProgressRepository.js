import { prisma } from "../prisma/client.js";

export async function findPveProgress(userId) {
  return prisma.pveProgress.findMany({
    where: { userId },
    select: { encounterKey: true, status: true, bestTurns: true, completedAt: true },
  });
}

export async function upsertPveProgress({ userId, encounterKey, completed, turns }) {
  const existing = await prisma.pveProgress.findUnique({
    where: { userId_encounterKey: { userId, encounterKey } },
    select: { status: true, bestTurns: true },
  });

  const status = completed || existing?.status === "COMPLETED" ? "COMPLETED" : "ATTEMPTED";
  const bestTurns = completed
    ? Math.min(existing?.bestTurns ?? Number.POSITIVE_INFINITY, turns)
    : existing?.bestTurns ?? null;

  return prisma.pveProgress.upsert({
    where: { userId_encounterKey: { userId, encounterKey } },
    create: {
      userId,
      encounterKey,
      status,
      bestTurns: Number.isFinite(bestTurns) ? bestTurns : null,
      completedAt: completed ? new Date() : null,
    },
    update: {
      status,
      bestTurns: Number.isFinite(bestTurns) ? bestTurns : null,
      completedAt: completed ? new Date() : undefined,
    },
    select: { encounterKey: true, status: true, bestTurns: true },
  });
}
