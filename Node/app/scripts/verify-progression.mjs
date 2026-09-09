import { prisma } from "../src/prisma/client.js";
import { reconcileRewardsForDate } from "../src/services/progressionService.js";
import { getCharacter } from "../src/services/progressionService.js";

const NAME = `__verify_${Date.now()}`;
const DATE = "2026-07-01";
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

async function ledger(userId) {
  const rows = await prisma.statReward.findMany({ where: { userId }, select: { stat: true }, orderBy: { stat: "asc" } });
  return rows.map((r) => r.stat);
}

const user = await prisma.auth.create({ data: { name: NAME, passwordHash: "x", timezone: "Europe/Riga" } });
try {
  await prisma.checkInHistory.create({ data: { userId: user.id, dateKey: DATE, answer: "YES" } });
  await reconcileRewardsForDate(user.id, DATE);
  check("recovery YES earns Strength", await ledger(user.id), ["strength"]);

  await reconcileRewardsForDate(user.id, DATE);
  await reconcileRewardsForDate(user.id, DATE);
  check("repeated reconciliation does not duplicate", await ledger(user.id), ["strength"]);

  await prisma.checkInHistory.update({ where: { userId_dateKey: { userId: user.id, dateKey: DATE } }, data: { answer: "NO" } });
  await reconcileRewardsForDate(user.id, DATE);
  check("switching to NO revokes Strength", await ledger(user.id), []);

  await prisma.checkInHistory.update({ where: { userId_dateKey: { userId: user.id, dateKey: DATE } }, data: { answer: "YES" } });
  await reconcileRewardsForDate(user.id, DATE);
  check("switching back to YES re-earns", await ledger(user.id), ["strength"]);

  const reading = await prisma.readingCheckIn.create({ data: { userId: user.id, dateKey: DATE, answer: "YES", reflection: null } });
  await reconcileRewardsForDate(user.id, DATE);
  check("reading YES without reflection earns Intelligence only", await ledger(user.id), ["intelligence", "strength"]);

  await prisma.readingCheckIn.update({ where: { id: reading.id }, data: { reflection: "   " } });
  await reconcileRewardsForDate(user.id, DATE);
  check("whitespace-only reflection earns no Wisdom", await ledger(user.id), ["intelligence", "strength"]);

  await prisma.readingCheckIn.update({ where: { id: reading.id }, data: { reflection: "A real thought." } });
  await reconcileRewardsForDate(user.id, DATE);
  check("reflection earns Wisdom", await ledger(user.id), ["intelligence", "strength", "wisdom"]);

  await prisma.readingCheckIn.update({ where: { id: reading.id }, data: { reflection: "" } });
  await reconcileRewardsForDate(user.id, DATE);
  check("clearing the reflection revokes Wisdom", await ledger(user.id), ["intelligence", "strength"]);

  const now = new Date();
  for (let position = 1; position <= 4; position += 1) {
    await prisma.dailyGoal.create({ data: { userId: user.id, dateKey: DATE, text: `goal ${position}`, position, completedAt: now } });
  }
  await reconcileRewardsForDate(user.id, DATE);
  check("four completed goals earn no Dexterity", await ledger(user.id), ["intelligence", "strength"]);

  const fifth = await prisma.dailyGoal.create({ data: { userId: user.id, dateKey: DATE, text: "goal 5", position: 5, completedAt: null } });
  await reconcileRewardsForDate(user.id, DATE);
  check("five goals with one open earn no Dexterity", await ledger(user.id), ["intelligence", "strength"]);

  await prisma.dailyGoal.update({ where: { id: fifth.id }, data: { completedAt: now } });
  await reconcileRewardsForDate(user.id, DATE);
  check("five complete goals earn Dexterity", await ledger(user.id), ["dexterity", "intelligence", "strength"]);

  await prisma.dailyGoal.update({ where: { id: fifth.id }, data: { completedAt: null } });
  await reconcileRewardsForDate(user.id, DATE);
  check("un-completing one goal revokes Dexterity", await ledger(user.id), ["intelligence", "strength"]);
  await prisma.dailyGoal.update({ where: { id: fifth.id }, data: { completedAt: now } });

  await Promise.all(Array.from({ length: 8 }, () => reconcileRewardsForDate(user.id, DATE)));
  check("eight concurrent reconciliations produce no duplicates", await ledger(user.id), ["dexterity", "intelligence", "strength"]);

  await prisma.auth.update({ where: { id: user.id }, data: { timezone: "Pacific/Auckland" } });
  await reconcileRewardsForDate(user.id, DATE);
  const keys = await prisma.statReward.findMany({ where: { userId: user.id }, select: { dateKey: true }, distinct: ["dateKey"] });
  check("rewards stay on the source row's stored date after a timezone change", keys.map((k) => k.dateKey), [DATE]);

  await prisma.gameProfile.upsert({
    where: { id: user.id },
    create: { id: user.id, baseStrength: 4, baseDexterity: 3, baseIntelligence: 3 },
    update: { baseStrength: 4, baseDexterity: 3, baseIntelligence: 3 },
  });
  const character = await getCharacter(user.id);
  check("totals are base plus ledger", character.totals, { strength: 5, dexterity: 4, intelligence: 4, wisdom: 0 });
  check("derived health follows strength", character.derived.maxHealth, 140);
} finally {
  await prisma.auth.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nAll runtime progression checks passed.");
process.exitCode = failures ? 1 : 0;
