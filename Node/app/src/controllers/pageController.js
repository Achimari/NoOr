import { getLeaderboardSummary } from "../services/leaderboardService.js";
import { getPrayers, getUserPrayers } from "../services/prayerService.js";
import { getStatisticsSummary } from "../services/statisticsService.js";
import { readFileSync } from "node:fs";

const motivationPhrases = JSON.parse(
  readFileSync(new URL("../data/motivationPhrases.json", import.meta.url), "utf8"),
);
const recoveryResources = JSON.parse(
  readFileSync(new URL("../data/recoveryResources.json", import.meta.url), "utf8"),
).resources;

function getRandomMotivationPhrase(lastPhraseId) {
  const availablePhrases = motivationPhrases.filter((phrase) => phrase.id !== lastPhraseId);
  const phrases = availablePhrases.length ? availablePhrases : motivationPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function getRandomRecoveryResource(lastResourceId) {
  const availableResources = recoveryResources.filter((resource) => resource.id !== lastResourceId);
  const resources = availableResources.length ? availableResources : recoveryResources;
  return resources[Math.floor(Math.random() * resources.length)];
}

export function renderPage({ view, pageId, titleKey }) {
  return async (req, res) => {
    const viewData = {};

    if (pageId === "daily-check-in") {
      viewData.leaderboard = await getLeaderboardSummary(req.user.id, req.user.timezone);
    }

    if (pageId === "community") {
      viewData.prayers = await getPrayers(req.user.id);
      viewData.telegramState = {
        isTelegramLinked: Boolean(req.user.isTelegramLinked),
      };
      viewData.motivationPhrase = getRandomMotivationPhrase(req.cookies?.lastMotivationPhraseId);
      viewData.recoveryResource = getRandomRecoveryResource(req.cookies?.lastRecoveryResourceId);
      res.cookie("lastMotivationPhraseId", viewData.motivationPhrase.id, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
      res.cookie("lastRecoveryResourceId", viewData.recoveryResource.id, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
    }

    if (pageId === "my-prayers") {
      viewData.prayerLists = await getUserPrayers(req.user.id);
      viewData.showPrayerActions = true;
    }

    if (pageId === "statistics") {
      viewData.statistics = await getStatisticsSummary(req.user.id);
    }

    res.render(`pages/${view}`, {
      pageId,
      title: res.locals.t(titleKey),
      ...viewData,
    });
  };
}
