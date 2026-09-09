import { z } from "zod";
import { isCalendarDateKey } from "../utils/dateKey.js";

export const dateKeySchema = z
  .string({ message: "Choose a valid date" })
  .trim()
  .refine(isCalendarDateKey, "Choose a valid date");
