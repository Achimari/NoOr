import {
  getLeaderboardSummary,
  incrementUserLeaderboard,
  resetUserLeaderboard,
} from "../services/leaderboardService.js";

export async function getLeaderboard(req, res) {
  const leaderboard = await getLeaderboardSummary(req.user.id, req.user.timezone);
  return res.json({ leaderboard });
}

export async function incrementLeaderboard(req, res) {
  const leaderboard = await incrementUserLeaderboard(req.user.id, req.user.timezone);
  return res.json({ leaderboard });
}

export async function resetLeaderboard(req, res) {
  const leaderboard = await resetUserLeaderboard(req.user.id, req.user.timezone);
  return res.json({ leaderboard });
}
