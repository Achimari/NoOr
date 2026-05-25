import { createPrayer, deletePrayerByOwner, findPrayers, findPrayersByUserId } from "../repositories/prayerRepository.js";
import { AppError } from "../utils/appError.js";

function sanitizePrayer(row, currentUserId = null) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    prayer: row.prayer,
    canDelete: currentUserId === row.userId,
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
  return rows.map((row) => sanitizePrayer(row, userId));
}

export async function removePrayer({ id, userId }) {
  const prayerId = Number(id);
  if (!Number.isInteger(prayerId) || prayerId <= 0) {
    throw new AppError("Prayer not found", 404);
  }

  const result = await deletePrayerByOwner({ id: prayerId, userId });
  if (result.count === 0) {
    throw new AppError("Prayer not found", 404);
  }

  return { success: true };
}
