import { checkDatabaseConnection } from "../repositories/healthRepository.js";

export async function getHealthStatus() {
  await checkDatabaseConnection();
  return { status: "ok" };
}
