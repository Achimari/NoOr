import { findCustomerDetailsById } from "../repositories/customerRepository.js";
import { calculateCurrentStreak, calculateMaxStreak } from "../repositories/checkInRepository.js";
import { AppError } from "../utils/appError.js";
import { getTodayDateKey } from "../utils/dateKey.js";

function formatTelegramUsername(username) {
  return username ? `@${username.replace(/^@/, "")}` : null;
}

function buildStatements(row) {
  const statementsByDate = new Map(
    (row.missedDays?.dates || []).map((dateKey) => [dateKey, { dateKey, answer: "MISSED" }]),
  );

  for (const item of row.checkInHistory || []) {
    statementsByDate.set(item.dateKey, {
      dateKey: item.dateKey,
      answer: item.answer,
    });
  }

  return [...statementsByDate.values()].sort((first, second) => (
    second.dateKey.localeCompare(first.dateKey)
  ));
}

function sanitizeCustomer(row) {
  const todayDateKey = getTodayDateKey(new Date(), row.timezone);

  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentStreak: calculateCurrentStreak(row.checkInHistory || [], todayDateKey),
    maxStreak: calculateMaxStreak(row.checkInHistory || []),
    todayAnswer: row.checkIn?.dateKey === todayDateKey ? row.checkIn.answer : null,
    todayDateKey: row.checkIn?.dateKey || null,
    statements: buildStatements(row),
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
