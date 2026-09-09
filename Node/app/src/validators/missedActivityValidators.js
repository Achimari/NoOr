import { z } from "zod";
import { DAILY_GOAL_TEXT_MAX } from "./dailyGoalValidators.js";
import { dateKeySchema } from "./dateKeyValidators.js";
import { historicalReadingCheckInSchema } from "./readingCheckInValidators.js";

export { historicalReadingCheckInSchema };

export const HISTORICAL_TASK_LIMIT = 5;
export const MISSED_ACTIVITY_PAGE_MAX = 30;

export const missedActivitiesPageSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MISSED_ACTIVITY_PAGE_MAX).default(MISSED_ACTIVITY_PAGE_MAX),
});

const historicalTaskListSchema = z
  .array(
    z
      .string({ message: "Write what you completed" })
      .trim()
      .min(1, "Write what you completed")
      .max(DAILY_GOAL_TEXT_MAX, `Keep each task under ${DAILY_GOAL_TEXT_MAX} characters`),
  )
  .max(HISTORICAL_TASK_LIMIT, `Add up to ${HISTORICAL_TASK_LIMIT} tasks`)
  .default([]);

export const historicalDailyGoalsSchema = z
  .object({
    dateKey: dateKeySchema,
    answer: z.enum(["YES", "NO"]).default("YES"),
    tasks: historicalTaskListSchema,
  })
  .superRefine(({ answer, tasks }, context) => {
    if (answer === "YES" && tasks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Add at least one task you completed",
      });
    }

    if (answer === "NO" && tasks.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "A No answer cannot include completed tasks",
      });
    }
  });
