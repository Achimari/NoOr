import {
  createPrayer,
  deletePrayerReaction,
  findPrayerById,
  findPrayers,
  findPrayersByUserId,
  markPrayerAnsweredByOwner,
  upsertPrayerReaction,
} from "../repositories/prayerRepository.js";
import { AppError } from "../utils/appError.js";
import { prayerReactionEmoji } from "../validators/prayerValidators.js";

export const supportedPrayerReactions = prayerReactionEmoji;

function summarizeReactions(reactions = []) {
  const counts = new Map();
  reactions.forEach((reaction) => {
    if (supportedPrayerReactions.includes(reaction.emoji)) {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) || 0) + 1);
    }
  });

  supportedPrayerReactions.forEach((emoji) => {
    if (!counts.has(emoji)) {
      counts.set(emoji, 0);
    }
  });

  return [...counts.entries()].map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

function sanitizePrayer(row, currentUserId = null) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    prayer: row.prayer,
    answeredAt: row.answeredAt || null,
    isAnswered: Boolean(row.answeredAt),
    canMarkAnswered: currentUserId === row.userId && !row.answeredAt,
    reactions: summarizeReactions(row.reactions),
    currentReaction: row.reactions?.find((reaction) => reaction.userId === currentUserId)?.emoji || null,
  };
}

export async function addPrayer({ userId, prayer }) {
  const row = await createPrayer({ userId, prayer });
  return sanitizePrayer(row, userId);
}

export async function getPrayers(currentUserId = null) {
  const rows = await findPrayers();
  return rows.map((row) => sanitizePrayer(row, currentUserId));
}

export async function getUserPrayers(userId) {
  const rows = await findPrayersByUserId(userId);
  const prayers = rows.map((row) => sanitizePrayer(row, userId));

  return {
    active: prayers,
  };
}

export async function markPrayerAnswered({ id, userId }) {
  const prayerId = Number(id);
  if (!Number.isInteger(prayerId) || prayerId <= 0) {
    throw new AppError("Prayer not found", 404);
  }

  const result = await markPrayerAnsweredByOwner({ id: prayerId, userId });
  if (result.count === 0) {
    throw new AppError("Prayer not found", 404);
  }

  return { success: true };
}

export async function reactToPrayer({ id, userId, emoji }) {
  const prayerId = Number(id);
  if (!Number.isInteger(prayerId) || prayerId <= 0) {
    throw new AppError("Prayer not found", 404);
  }

  if (!supportedPrayerReactions.includes(emoji)) {
    throw new AppError("Choose a supported reaction", 400);
  }

  try {
    await upsertPrayerReaction({ prayerId, userId, emoji });
  } catch (error) {
    if (error.code === "P2003") {
      throw new AppError("Prayer not found", 404);
    }

    throw error;
  }

  const prayer = await findPrayerById(prayerId);
  if (!prayer) {
    throw new AppError("Prayer not found", 404);
  }

  return sanitizePrayer(prayer, userId);
}

export async function removePrayerReaction({ id, userId }) {
  const prayerId = Number(id);
  if (!Number.isInteger(prayerId) || prayerId <= 0) {
    throw new AppError("Prayer not found", 404);
  }

  const prayer = await findPrayerById(prayerId);
  if (!prayer) {
    throw new AppError("Prayer not found", 404);
  }

  await deletePrayerReaction({ prayerId, userId });
  const updatedPrayer = await findPrayerById(prayerId);
  return sanitizePrayer(updatedPrayer, userId);
}
