import { z } from "zod";

export const DAILY_GOAL_TEXT_MAX = 200;

export const dailyGoalTextSchema = z.object({
  text: z
    .string({ message: "Write what you want to complete" })
    .trim()
    .min(1, "Write what you want to complete")
    .max(DAILY_GOAL_TEXT_MAX, `Keep the goal under ${DAILY_GOAL_TEXT_MAX} characters`),
});

export const dailyGoalCompletionSchema = z.object({
  completed: z.boolean({ message: "Choose whether the goal is completed" }),
});
