import { prisma } from "../src/prisma/client.js";
import { reconcileAllRewards } from "../src/services/progressionService.js";
import { ensureGameProfile } from "../src/repositories/gameProfileRepository.js";

async function main() {
  const users = await prisma.auth.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  let totalCreated = 0;
  let totalRemoved = 0;

  console.log(`Backfilling stat rewards for ${users.length} user(s)...`);

  for (const user of users) {
    await ensureGameProfile(user.id);
    const { dateKeys, created, removed } = await reconcileAllRewards(user.id);
    totalCreated += created;
    totalRemoved += removed;

    console.log(`  user ${user.id}: ${dateKeys} day(s), +${created} reward(s), -${removed}`);
  }

  console.log(`Done. Created ${totalCreated}, removed ${totalRemoved}.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
