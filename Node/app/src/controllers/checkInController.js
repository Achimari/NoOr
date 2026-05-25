import { getCheckInStatus } from "../services/checkInService.js";

export async function getCurrentCheckInStatus(req, res) {
  const status = await getCheckInStatus(req.user.id);
  return res.json(status);
}
