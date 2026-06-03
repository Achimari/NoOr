import { z } from "zod";

export const prayerSchema = z.object({
  prayer: z.string().trim().min(2, "Prayer must contain at least 2 characters").max(500),
});

export const prayerReactionEmoji = ["🙏", "❤️", "🙌", "🕊️", "💪", "🤍"];

export const prayerReactionSchema = z.object({
  emoji: z.string().refine((emoji) => prayerReactionEmoji.includes(emoji), "Choose a supported reaction"),
});
