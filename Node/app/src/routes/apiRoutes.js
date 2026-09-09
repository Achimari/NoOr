import { Router } from "express";
import { meApi } from "../controllers/authController.js";
import { answerCurrentMissedDay, getCurrentCheckInStatus, updateCurrentCheckInAnswer } from "../controllers/checkInController.js";
import { getCustomerDetailsApi } from "../controllers/customerController.js";
import {
  getGameMe,
  getProfileApi,
  getProfileTodayApi,
  getSpellsApi,
  patchGameProfile,
  postAllocation,
} from "../controllers/gameController.js";
import {
  createCurrentDailyGoal,
  createMissedDailyGoalsEntry,
  deleteCurrentDailyGoal,
  getCurrentDailyGoals,
  updateCurrentDailyGoalCompletion,
  updateCurrentDailyGoalText,
} from "../controllers/dailyGoalController.js";
import { getCurrentMissedActivities } from "../controllers/missedActivityController.js";
import { getLeaderboard, incrementLeaderboard, resetLeaderboard } from "../controllers/leaderboardController.js";
import { answerPrayer, deletePrayerReaction, listPrayers, postPrayer, postPrayerReaction } from "../controllers/prayerController.js";
import {
  createCurrentReadingCheckIn,
  createMissedReadingCheckInEntry,
  getBibleBookMetadata,
  getCurrentReadingCheckInStatus,
  updateCurrentReadingCheckIn,
} from "../controllers/readingCheckInController.js";
import {
  deleteQueue,
  getBattleApi,
  getPveEncountersApi,
  getQueue,
  postBattleAction,
  postBattleForfeit,
  postPveStart,
  postQueue,
} from "../controllers/battleController.js";
import { postSpellUnlock, putSpellLoadout } from "../controllers/spellController.js";
import { getTelegramConnectLink, sendTelegramTestNotification } from "../controllers/telegramController.js";
import { updateCurrentUserTimezone } from "../controllers/userSettingsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { validateApiBody } from "../middleware/validateRequest.js";
import {
  battleActionRateLimiter,
  profileWriteRateLimiter,
  queueRateLimiter,
  spellUnlockRateLimiter,
} from "../config/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dailyGoalCompletionSchema, dailyGoalTextSchema } from "../validators/dailyGoalValidators.js";
import { battleActionSchema, forfeitSchema } from "../validators/battleValidators.js";
import { allocationSchema, loadoutSchema, profilePresentationSchema } from "../validators/gameValidators.js";
import { prayerReactionSchema, prayerSchema } from "../validators/prayerValidators.js";
import {
  historicalDailyGoalsSchema,
  historicalReadingCheckInSchema,
} from "../validators/missedActivityValidators.js";
import { readingCheckInSchema } from "../validators/readingCheckInValidators.js";
import { timezoneSchema } from "../validators/timezoneValidators.js";

const router = Router();

router.get("/api/me", requireAuth, meApi);
router.patch("/api/me/timezone", requireAuth, validateApiBody(timezoneSchema), asyncHandler(updateCurrentUserTimezone));
router.get("/api/customers/:id", requireAuth, asyncHandler(getCustomerDetailsApi));
router.get("/api/check-in/status", requireAuth, asyncHandler(getCurrentCheckInStatus));
router.patch("/api/check-in/today", requireAuth, asyncHandler(updateCurrentCheckInAnswer));
router.post("/api/check-in/missed", requireAuth, asyncHandler(answerCurrentMissedDay));
router.get("/api/missed-activities", requireAuth, asyncHandler(getCurrentMissedActivities));
router.get("/api/reading-check-in/books", requireAuth, getBibleBookMetadata);
router.get("/api/reading-check-in/status", requireAuth, asyncHandler(getCurrentReadingCheckInStatus));
router.post("/api/reading-check-in/today", requireAuth, validateApiBody(readingCheckInSchema), asyncHandler(createCurrentReadingCheckIn));
router.patch("/api/reading-check-in/today", requireAuth, validateApiBody(readingCheckInSchema), asyncHandler(updateCurrentReadingCheckIn));
router.post("/api/reading-check-in/missed", requireAuth, validateApiBody(historicalReadingCheckInSchema), asyncHandler(createMissedReadingCheckInEntry));
router.get("/api/daily-goals/today", requireAuth, asyncHandler(getCurrentDailyGoals));
router.post("/api/daily-goals/today", requireAuth, validateApiBody(dailyGoalTextSchema), asyncHandler(createCurrentDailyGoal));
router.post("/api/daily-goals/missed", requireAuth, validateApiBody(historicalDailyGoalsSchema), asyncHandler(createMissedDailyGoalsEntry));
router.patch("/api/daily-goals/:id/completion", requireAuth, validateApiBody(dailyGoalCompletionSchema), asyncHandler(updateCurrentDailyGoalCompletion));
router.patch("/api/daily-goals/:id", requireAuth, validateApiBody(dailyGoalTextSchema), asyncHandler(updateCurrentDailyGoalText));
router.delete("/api/daily-goals/:id", requireAuth, asyncHandler(deleteCurrentDailyGoal));
router.get("/api/game/me", requireAuth, asyncHandler(getGameMe));
router.patch("/api/game/profile", requireAuth, profileWriteRateLimiter, validateApiBody(profilePresentationSchema), asyncHandler(patchGameProfile));
router.post("/api/game/allocation", requireAuth, profileWriteRateLimiter, validateApiBody(allocationSchema), asyncHandler(postAllocation));
router.get("/api/profiles/:id", requireAuth, asyncHandler(getProfileApi));
router.get("/api/profiles/:id/today", requireAuth, asyncHandler(getProfileTodayApi));
router.get("/api/spells", requireAuth, asyncHandler(getSpellsApi));
router.post("/api/spells/:spellKey/unlock", requireAuth, spellUnlockRateLimiter, asyncHandler(postSpellUnlock));
router.put("/api/game/loadout", requireAuth, profileWriteRateLimiter, validateApiBody(loadoutSchema), asyncHandler(putSpellLoadout));
router.get("/api/pve/encounters", requireAuth, asyncHandler(getPveEncountersApi));
router.post("/api/pve/encounters/:encounterKey/start", requireAuth, battleActionRateLimiter, asyncHandler(postPveStart));
router.post("/api/pvp/queue", requireAuth, queueRateLimiter, asyncHandler(postQueue));
router.get("/api/pvp/queue", requireAuth, asyncHandler(getQueue));
router.delete("/api/pvp/queue", requireAuth, asyncHandler(deleteQueue));
router.get("/api/battles/:id", requireAuth, asyncHandler(getBattleApi));
router.post("/api/battles/:id/actions", requireAuth, battleActionRateLimiter, validateApiBody(battleActionSchema), asyncHandler(postBattleAction));
router.post("/api/battles/:id/forfeit", requireAuth, battleActionRateLimiter, validateApiBody(forfeitSchema), asyncHandler(postBattleForfeit));
router.get("/api/leaderboard", requireAuth, asyncHandler(getLeaderboard));
router.post("/api/leaderboard/increment", requireAuth, asyncHandler(incrementLeaderboard));
router.post("/api/leaderboard/reset", requireAuth, asyncHandler(resetLeaderboard));
router.get("/api/prayers", requireAuth, asyncHandler(listPrayers));
router.post("/api/prayers", requireAuth, validateApiBody(prayerSchema), asyncHandler(postPrayer));
router.post("/api/prayers/:id/reaction", requireAuth, validateApiBody(prayerReactionSchema), asyncHandler(postPrayerReaction));
router.post("/api/prayers/:id/answered", requireAuth, asyncHandler(answerPrayer));
router.delete("/api/prayers/:id/reaction", requireAuth, asyncHandler(deletePrayerReaction));
router.delete("/api/prayers/:id", requireAuth, asyncHandler(answerPrayer));
router.get("/api/telegram/connect-link", requireAuth, asyncHandler(getTelegramConnectLink));
router.post("/api/telegram/test-notification", requireAuth, asyncHandler(sendTelegramTestNotification));

export default router;
