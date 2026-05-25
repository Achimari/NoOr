import { prisma } from "../prisma/client.js";

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}
