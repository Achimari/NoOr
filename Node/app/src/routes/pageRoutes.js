import { Router } from "express";
import {
  redirectExploreToProfile,
  redirectLegacyCustomer,
  renderOwnProfile,
  renderPublicProfile,
} from "../controllers/profilePageController.js";
import { renderPage } from "../controllers/pageController.js";
import { renderAchievementsPage } from "../controllers/achievementController.js";
import { renderBattlePage } from "../controllers/battleController.js";
import { renderHelpPage } from "../controllers/helpController.js";
import {
  renderSettingsPage,
  updateCurrentUserName,
  updateCurrentUserPassword,
} from "../controllers/userSettingsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { validateBody } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { nicknameSchema, passwordChangeSchema } from "../validators/userSettingsValidators.js";

const router = Router();

router.get("/customer/:id", requireAuth, redirectLegacyCustomer);
router.get("/profile", requireAuth, asyncHandler(renderOwnProfile));
router.get("/profile/:id", requireAuth, asyncHandler(renderPublicProfile));
router.get("/explore", requireAuth, redirectExploreToProfile);
router.get("/achievements", requireAuth, asyncHandler(renderAchievementsPage()));
router.get("/battle", requireAuth, asyncHandler(renderBattlePage));
router.get("/help", requireAuth, renderHelpPage);
router.get("/settings", requireAuth, renderSettingsPage);
router.post("/settings/nickname", requireAuth, validateBody(nicknameSchema), asyncHandler(updateCurrentUserName));
router.post("/settings/password", requireAuth, validateBody(passwordChangeSchema), asyncHandler(updateCurrentUserPassword));
router.get("/", requireAuth, (req, res) => res.redirect("/daily-check-in"));
router.get("/prayer-needs", requireAuth, (req, res) => res.redirect("/my-prayers"));
router.get("/info", requireAuth, (req, res) => res.redirect("/community"));

const pages = [
  { path: "/daily-check-in", view: "home", pageId: "daily-check-in", titleKey: "dailyCheckIn.title" },
  { path: "/statistics", view: "statistics", pageId: "statistics", titleKey: "statistics.title" },
  { path: "/my-prayers", view: "my-prayers", pageId: "my-prayers", titleKey: "myPrayers.title" },
  { path: "/community", view: "community", pageId: "community", titleKey: "community.title" },
  { path: "/about", view: "about", pageId: "about", titleKey: "about.title" },
];

for (const page of pages) {
  router.get(page.path, requireAuth, renderPage(page));
}

export default router;
