import { answerMissedDay, getCheckInStatus, updateTodayCheckIn } from "../services/checkInService.js";
import { getLeaderboardSummary } from "../services/leaderboardService.js";

export async function getCurrentCheckInStatus(req, res) {
  const status = await getCheckInStatus(req.user.id, req.user.timezone);
  return res.json(status);
}

export async function updateCurrentCheckInAnswer(req, res) {
  await updateTodayCheckIn(req.user.id, {
    answer: req.body?.answer,
    timezone: req.user.timezone,
  });
  const [status, leaderboard] = await Promise.all([
    getCheckInStatus(req.user.id, req.user.timezone),
    getLeaderboardSummary(req.user.id, req.user.timezone),
  ]);
  return res.json({ status, leaderboard });
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
