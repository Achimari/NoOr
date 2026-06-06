import { answerMissedDay, getCheckInStatus } from "../services/checkInService.js";
import { getLeaderboardSummary } from "../services/leaderboardService.js";

export async function getCurrentCheckInStatus(req, res) {
  const status = await getCheckInStatus(req.user.id);
  return res.json(status);
}

export async function answerCurrentMissedDay(req, res) {
  await answerMissedDay(req.user.id, {
    dateKey: req.body?.dateKey,
    answer: req.body?.answer,
  });
  const leaderboard = await getLeaderboardSummary(req.user.id);
  return res.json({ leaderboard });
}
