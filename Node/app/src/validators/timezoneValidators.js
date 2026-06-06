import { z } from "zod";
import { isSupportedTimezone } from "../utils/timezones.js";

export const timezoneSchema = z.object({
  timezone: z.string().trim().refine(isSupportedTimezone, "Choose a valid timezone"),
});
