import { Router } from "express";
import { meApi } from "../controllers/authController.js";
import { answerCurrentMissedDay, getCurrentCheckInStatus, updateCurrentCheckInAnswer } from "../controllers/checkInController.js";
import { getCustomerDetailsApi } from "../controllers/customerController.js";
import { getLeaderboard, incrementLeaderboard, resetLeaderboard } from "../controllers/leaderboardController.js";
import { answerPrayer, deletePrayerReaction, listPrayers, postPrayer, postPrayerReaction } from "../controllers/prayerController.js";
import { getTelegramConnectLink, sendTelegramTestNotification } from "../controllers/telegramController.js";
import { updateCurrentUserTimezone } from "../controllers/userSettingsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { validateApiBody } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prayerReactionSchema, prayerSchema } from "../validators/prayerValidators.js";
import { timezoneSchema } from "../validators/timezoneValidators.js";

const router = Router();

router.get("/api/me", requireAuth, meApi);
router.patch("/api/me/timezone", requireAuth, validateApiBody(timezoneSchema), asyncHandler(updateCurrentUserTimezone));
router.get("/api/customers/:id", requireAuth, asyncHandler(getCustomerDetailsApi));
router.get("/api/check-in/status", requireAuth, asyncHandler(getCurrentCheckInStatus));
router.patch("/api/check-in/today", requireAuth, asyncHandler(updateCurrentCheckInAnswer));
router.post("/api/check-in/missed", requireAuth, asyncHandler(answerCurrentMissedDay));
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
