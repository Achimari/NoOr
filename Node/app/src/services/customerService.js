import { findCustomerDetailsById } from "../repositories/customerRepository.js";
import { AppError } from "../utils/appError.js";

function formatTelegramUsername(username) {
  return username ? `@${username.replace(/^@/, "")}` : null;
}

function sanitizeCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentStreak: row.leaderboard?.value || 0,
    maxStreak: row.leaderboard?.maxStreak || 0,
    todayAnswer: row.checkIn?.answer || null,
    todayDateKey: row.checkIn?.dateKey || null,
    prayers: row.prayers.map((item) => ({
      id: item.id,
      prayer: item.prayer,
    })),
    telegram: {
      isLinked: Boolean(row.isTelegramLinked && row.telegramConnection?.isActive),
      status: row.isTelegramLinked && row.telegramConnection?.isActive ? "Linked" : "Not linked",
      username: formatTelegramUsername(row.telegramConnection?.telegramUsername),
      firstName: row.telegramConnection?.telegramFirstName || null,
      connectedAt: row.telegramConnection?.connectedAt || null,
      isActive: Boolean(row.telegramConnection?.isActive),
    },
  };
}

export async function getCustomerDetails(id) {
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new AppError("User not found", 404);
  }

  const row = await findCustomerDetailsById(customerId);
  if (!row) {
    throw new AppError("User not found", 404);
  }

  return sanitizeCustomer(row);
}
