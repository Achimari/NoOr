import {
  DAILY_GOAL_LIMIT,
  createDailyGoal,
  createHistoricalDailyGoals,
  deleteDailyGoal,
  findDailyGoalForOwner,
  findDailyGoals,
  updateDailyGoalCompletion,
  updateDailyGoalText,
} from "../repositories/dailyGoalRepository.js";
import { AppError } from "../utils/appError.js";
import { getNextResetAt, getTodayDateKey } from "../utils/dateKey.js";
import { assertHistoricalDateKey, getHistoricalDayContext } from "./missedActivityService.js";
import { reconcileRewardsForDate } from "./progressionService.js";

export function getDailyGoalStatus(goal, todayDateKey) {
  if (goal.completedAt) return "COMPLETED";

  return goal.dateKey === todayDateKey ? "PENDING" : "INCOMPLETE";
}

function sanitizeDailyGoal(goal, todayDateKey) {
  return {
    id: goal.id,
    text: goal.text,
    position: goal.position,
    completed: Boolean(goal.completedAt),
    status: getDailyGoalStatus(goal, todayDateKey),
    completedAt: goal.completedAt ? goal.completedAt.toISOString() : null,
  };
}

function buildSummary(goals, { dateKey, nextResetAt }) {
  const sanitized = goals.map((goal) => sanitizeDailyGoal(goal, dateKey));
  const completedCount = sanitized.filter((goal) => goal.completed).length;

  return {
    dateKey,
    nextResetAt,
    limit: DAILY_GOAL_LIMIT,
    total: sanitized.length,
    completedCount,
    remainingSlots: Math.max(0, DAILY_GOAL_LIMIT - sanitized.length),
    goals: sanitized,
  };
}

function getDayContext(timezone) {
  return {
    dateKey: getTodayDateKey(new Date(), timezone),
    nextResetAt: getNextResetAt(new Date(), timezone).toISOString(),
  };
}

async function loadSummary(userId, { dateKey, nextResetAt }) {
  const goals = await findDailyGoals({ userId, dateKey });

  return buildSummary(goals, { dateKey, nextResetAt });
}

async function loadSummaryAndReconcile(userId, day) {
  await reconcileRewardsForDate(userId, day.dateKey);

  return loadSummary(userId, day);
}

async function assertMutableGoal({ id, userId, dateKey, requireIncomplete }) {
  const goal = await findDailyGoalForOwner({ id, userId });

  if (!goal) {
    throw new AppError("Goal not found", 404);
  }
  if (goal.dateKey !== dateKey) {
    throw new AppError("That goal belongs to a day that has ended", 409);
  }
  if (requireIncomplete && goal.completedAt) {
    throw new AppError("Completed goals are kept as history", 409);
  }

  return goal;
}

export async function getTodayDailyGoals(userId, timezone) {
  const day = getDayContext(timezone);

  return loadSummary(userId, day);
}

export async function createTodayDailyGoal(userId, timezone, { text }) {
  const day = getDayContext(timezone);
  const goal = await createDailyGoal({ userId, dateKey: day.dateKey, text });

  if (!goal) {
    throw new AppError(`You can plan up to ${DAILY_GOAL_LIMIT} goals a day`, 409);
  }

  return loadSummaryAndReconcile(userId, day);
}

export async function createMissedDailyGoals(userId, timezone, { dateKey, answer, tasks }, { now = new Date(), client } = {}) {
  const day = await getHistoricalDayContext(userId, timezone, { now, client });
  assertHistoricalDateKey(dateKey, day);

  const created = await createHistoricalDailyGoals(
    { userId, dateKey, answer, tasks, completedAt: now },
    client,
  );

  if (created === null) {
    throw new AppError("That task day has already been answered", 409);
  }

  await reconcileRewardsForDate(userId, dateKey, client);

  return { dateKey, answer, created };
}

export async function updateTodayDailyGoalText(userId, timezone, { id, text }) {
  const day = getDayContext(timezone);
  await assertMutableGoal({ id, userId, dateKey: day.dateKey, requireIncomplete: true });

  const updated = await updateDailyGoalText({ id, userId, dateKey: day.dateKey, text });
  if (!updated) {
    throw new AppError("That goal can no longer be changed", 409);
  }

  return loadSummaryAndReconcile(userId, day);
}

export async function setTodayDailyGoalCompletion(userId, timezone, { id, completed }) {
  const day = getDayContext(timezone);
  await assertMutableGoal({ id, userId, dateKey: day.dateKey, requireIncomplete: false });

  const completedAt = completed ? new Date() : null;
  const updated = await updateDailyGoalCompletion({ id, userId, dateKey: day.dateKey, completedAt });
  if (!updated) {
    throw new AppError("That goal can no longer be changed", 409);
  }

  return loadSummaryAndReconcile(userId, day);
}

export async function removeTodayDailyGoal(userId, timezone, { id }) {
  const day = getDayContext(timezone);
  await assertMutableGoal({ id, userId, dateKey: day.dateKey, requireIncomplete: true });

  const removed = await deleteDailyGoal({ id, userId, dateKey: day.dateKey });
  if (!removed) {
    throw new AppError("That goal can no longer be removed", 409);
  }

  return loadSummaryAndReconcile(userId, day);
}
