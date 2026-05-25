import { z } from "zod";

export const prayerSchema = z.object({
  prayer: z.string().trim().min(2, "Prayer must contain at least 2 characters").max(500),
});
