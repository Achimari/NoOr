import { getMissedActivities } from "../services/missedActivityService.js";
import {
  createMissedDailyGoals,
  createTodayDailyGoal,
  getTodayDailyGoals,
  removeTodayDailyGoal,
  setTodayDailyGoalCompletion,
  updateTodayDailyGoalText,
} from "../services/dailyGoalService.js";
import { AppError } from "../utils/appError.js";

function parseGoalId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new AppError("Invalid goal id", 400);
  }

  return id;
}

export async function getCurrentDailyGoals(req, res) {
  const summary = await getTodayDailyGoals(req.user.id, req.user.timezone);
  return res.json(summary);
}

export async function createCurrentDailyGoal(req, res) {
  const summary = await createTodayDailyGoal(req.user.id, req.user.timezone, {
    text: req.validatedBody.text,
  });
  return res.status(201).json(summary);
}

export async function createMissedDailyGoalsEntry(req, res) {
  const day = await createMissedDailyGoals(req.user.id, req.user.timezone, req.validatedBody);
  const missedActivities = await getMissedActivities(req.user.id, req.user.timezone);

  return res.status(201).json({ day, missedActivities });
}

export async function updateCurrentDailyGoalText(req, res) {
  const summary = await updateTodayDailyGoalText(req.user.id, req.user.timezone, {
    id: parseGoalId(req.params.id),
    text: req.validatedBody.text,
  });
  return res.json(summary);
}

export async function updateCurrentDailyGoalCompletion(req, res) {
  const summary = await setTodayDailyGoalCompletion(req.user.id, req.user.timezone, {
    id: parseGoalId(req.params.id),
    completed: req.validatedBody.completed,
  });
  return res.json(summary);
}

export async function deleteCurrentDailyGoal(req, res) {
  const summary = await removeTodayDailyGoal(req.user.id, req.user.timezone, {
    id: parseGoalId(req.params.id),
  });
  return res.json(summary);
}
