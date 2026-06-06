import { answerMissedDay, getCheckInStatus } from "../services/checkInService.js";
import { getLeaderboardSummary } from "../services/leaderboardService.js";

export async function getCurrentCheckInStatus(req, res) {
  const status = await getCheckInStatus(req.user.id, req.user.timezone);
  return res.json(status);
}

export async function answerCurrentMissedDay(req, res) {
  await answerMissedDay(req.user.id, {
    dateKey: req.body?.dateKey,
    answer: req.body?.answer,
    timezone: req.user.timezone,
  });
  const leaderboard = await getLeaderboardSummary(req.user.id, req.user.timezone);
  return res.json({ leaderboard });
}
