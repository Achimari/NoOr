import { getHealthStatus } from "../services/healthService.js";

export async function healthCheck(req, res) {
  const status = await getHealthStatus();
  res.json(status);
}
