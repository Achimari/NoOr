import { Router } from "express";
import { healthCheck } from "../controllers/healthController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/health", asyncHandler(healthCheck));

export default router;
