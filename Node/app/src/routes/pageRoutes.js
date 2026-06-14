import { Router } from "express";
import { renderCustomerDetails } from "../controllers/customerController.js";
import { renderPage } from "../controllers/pageController.js";
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

router.get("/customer/:id", requireAuth, asyncHandler(renderCustomerDetails));
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
