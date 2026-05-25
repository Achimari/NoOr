import { Router } from "express";
import { renderCustomerDetails } from "../controllers/customerController.js";
import { renderPage } from "../controllers/pageController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/customer/:id", requireAuth, asyncHandler(renderCustomerDetails));

const pages = [
  { path: "/", view: "home", pageId: "home", titleKey: "home.hero.title" },
  { path: "/prayer-needs", view: "prayer-needs", pageId: "prayer-needs", titleKey: "prayerNeeds.title" },
  { path: "/info", view: "info", pageId: "info", titleKey: "info.title" },
  { path: "/about", view: "about", pageId: "about", titleKey: "about.title" },
];

for (const page of pages) {
  router.get(page.path, requireAuth, renderPage(page));
}

export default router;
