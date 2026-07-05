import { getLeaderboardSummary, submitDailyAnswer } from "../services/leaderboardService.js";

export async function getLeaderboard(req, res) {
  const leaderboard = await getLeaderboardSummary(req.user.id, req.user.timezone);
  return res.json({ leaderboard });
}

export async function incrementLeaderboard(req, res) {
  const { status, leaderboard } = await submitDailyAnswer(req.user.id, "YES", req.user.timezone);
  return res.json({ leaderboard, status });
}

export async function resetLeaderboard(req, res) {
  const { status, leaderboard } = await submitDailyAnswer(req.user.id, "NO", req.user.timezone);
  return res.json({ leaderboard, status });
}
