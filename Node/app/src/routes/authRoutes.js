import { Router } from "express";
import {
  getLogin,
  getOnboarding,
  loginApi,
  logoutApi,
  meApi,
  postLogin,
  postLogout,
  registerApi,
} from "../controllers/authController.js";
import { authRateLimiter } from "../config/security.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loginSchema, registerSchema } from "../validators/authValidators.js";
import { validateBody } from "../middleware/validateRequest.js";

const router = Router();

router.get("/login", getLogin);
router.get("/onboarding", getOnboarding);
router.post("/login", authRateLimiter, validateBody(loginSchema), asyncHandler(postLogin));
router.post("/logout", asyncHandler(postLogout));

router.post("/auth/register", authRateLimiter, validateBody(registerSchema), asyncHandler(registerApi));
router.post("/auth/login", authRateLimiter, validateBody(loginSchema), asyncHandler(loginApi));
router.post("/auth/logout", asyncHandler(logoutApi));
router.get("/auth/me", requireAuth, meApi);

export default router;
