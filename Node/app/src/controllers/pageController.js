import { getLeaderboardSummary } from "../services/leaderboardService.js";
import { getCheckInStatus } from "../services/checkInService.js";
import { getPrayers, getUserPrayers } from "../services/prayerService.js";
import { readFileSync } from "node:fs";

const motivationPhrases = JSON.parse(
  readFileSync(new URL("../data/motivationPhrases.json", import.meta.url), "utf8"),
);

function getRandomMotivationPhrase(lastPhraseId) {
  const availablePhrases = motivationPhrases.filter((phrase) => phrase.id !== lastPhraseId);
  const phrases = availablePhrases.length ? availablePhrases : motivationPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function renderPage({ view, pageId, titleKey }) {
  return async (req, res) => {
    const viewData = {};

    if (pageId === "daily-check-in") {
      viewData.leaderboard = await getLeaderboardSummary(req.user.id, req.user.timezone);
    }

    if (pageId === "community") {
      const [leaderboard, checkIn, prayers] = await Promise.all([
        getLeaderboardSummary(req.user.id, req.user.timezone),
        getCheckInStatus(req.user.id, req.user.timezone),
        getPrayers(req.user.id),
      ]);

      viewData.infoStats = {
        name: req.user.name,
        currentStreak: leaderboard.current.value,
        maxStreak: leaderboard.current.maxStreak,
        todayAnswer: checkIn.answer || "Pending",
      };
      viewData.telegramState = {
        isTelegramLinked: Boolean(req.user.isTelegramLinked),
      };
      viewData.prayers = prayers;
      viewData.motivationPhrase = getRandomMotivationPhrase(req.cookies?.lastMotivationPhraseId);
      res.cookie("lastMotivationPhraseId", viewData.motivationPhrase.id, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
    }

    if (pageId === "my-prayers") {
      viewData.prayerLists = await getUserPrayers(req.user.id);
      viewData.showPrayerActions = true;
    }

    res.render(`pages/${view}`, {
      pageId,
      title: res.locals.t(titleKey),
      siteData: res.locals.siteData,
      ...viewData,
    });
  };
}
