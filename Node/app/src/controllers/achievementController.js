import { getAchievementsForUser } from "../services/achievementService.js";

export function renderAchievementsPage(loadAchievements = getAchievementsForUser) {
  return async function renderAchievements(req, res) {
    const achievements = await loadAchievements(req.user.id);

    return res.render("pages/achievements", {
      pageId: "achievements",
      title: "Achievements",
      achievements,
    });
  };
}
