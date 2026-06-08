import crypto from "node:crypto";
import { AppError } from "../utils/appError.js";
import { logger } from "../utils/logger.js";
import { toSafeTelegramError } from "../utils/telegramError.js";
import {
  claimTelegramNotification,
  createTelegramConnectToken,
  findActiveTelegramConnections,
  findTelegramConnectionByChatId,
  findTelegramConnectionByUserId,
  findTelegramConnectToken,
  markTelegramConnectTokenUsed,
  upsertTelegramConnection,
} from "../repositories/telegramRepository.js";
import { getTelegramBot, getTelegramBotUsername } from "./telegramBotService.js";
import { getCheckInStatus } from "./checkInService.js";
import { addPrayer } from "./prayerService.js";
import { incrementUserLeaderboard, resetUserLeaderboard } from "./leaderboardService.js";
import { getTodayDateKey, getZonedParts } from "../utils/dateKey.js";
import { env } from "../config/env.js";

const CONNECT_TOKEN_TTL_MS = 10 * 60 * 1000;
const PRAYER_DIGEST_HOUR = 22;
const pendingPrayerChats = new Map();
const notificationTypes = {
  answerReminder: "answer_reminder",
  prayerDigest: "prayer_digest",
};

const telegramActions = {
  addPrayer: "noor:add_prayer",
  answer: "noor:answer",
  answerYes: "noor:answer_yes",
  answerNo: "noor:answer_no",
  seePrayers: "noor:see_prayers",
  menu: "noor:menu",
};

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeUsername(username) {
  return username ? username.replace(/^@/, "").trim() : null;
}

function assertTelegramConfigured() {
  if (!getTelegramBot()) {
    throw new AppError("Bot token missing", 503);
  }
}

function menuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Add prayer", callback_data: telegramActions.addPrayer },
        { text: "Answer today", callback_data: telegramActions.answer },
      ],
      [{ text: "See prayers", callback_data: telegramActions.seePrayers }],
    ],
  };
}

function answerKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "YES, I did", callback_data: telegramActions.answerYes },
        { text: "NO, I didn't", callback_data: telegramActions.answerNo },
      ],
      [{ text: "Back", callback_data: telegramActions.menu }],
    ],
  };
}

function chatIdFrom(input) {
  return String(input?.id || input);
}

function getAnswerReminderHour() {
  return (env.CHECK_IN_RESET_HOUR + 23) % 24;
}

function shouldRunAtLocalHour(now, timezone, hour) {
  const parts = getZonedParts(now, timezone);
  return Number(parts.hour) === hour && Number(parts.minute || 0) === 0;
}

async function findLinkedUserByChat(chatId) {
  const connection = await findTelegramConnectionByChatId(String(chatId));
  if (!connection || !connection.isActive) return null;
  return connection;
}

async function sendTelegramMenu(chatId, text = "NoOr is ready. Choose an action:") {
  const activeBot = getTelegramBot();
  if (!activeBot) return;

  await activeBot.sendMessage(chatId, text, {
    reply_markup: menuKeyboard(),
  });
}

async function sendTelegramAnswerMenu(chatId, userId) {
  const activeBot = getTelegramBot();
  if (!activeBot) return;

  const connection = await findTelegramConnectionByUserId(userId);
  const status = await getCheckInStatus(userId, connection?.user?.timezone);
  if (!status.canAnswer) {
    await activeBot.sendMessage(
      chatId,
      `Already answered today: ${status.answer}.\nCome back after the next reset.`,
      { reply_markup: menuKeyboard() },
    );
    return;
  }

  await activeBot.sendMessage(chatId, "Did you stay strong today?", {
    reply_markup: answerKeyboard(),
  });
}

function formatPrayers(prayers) {
  if (!prayers.length) {
    return "Prayer list is empty today.";
  }

  const lines = prayers.slice(0, 10).map((item, index) => {
    return `${index + 1}. ${item.userName} needs prayer for: ${item.prayer}`;
  });

  const suffix = prayers.length > 10 ? `\n\nAnd ${prayers.length - 10} more in NoOr.` : "";
  return `Pray today:\n\n${lines.join("\n")}${suffix}`;
}

async function sendPrayerList(chatId) {
  const activeBot = getTelegramBot();
  if (!activeBot) return;

  const { getPrayers } = await import("./prayerService.js");
  const prayers = await getPrayers();

  await activeBot.sendMessage(chatId, formatPrayers(prayers), {
    reply_markup: menuKeyboard(),
  });
}

export async function createTelegramConnectLink(userId) {
  assertTelegramConfigured();

  const botUsername = await getTelegramBotUsername();
  if (!botUsername) {
    throw new AppError("Bot token missing", 503);
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await createTelegramConnectToken({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + CONNECT_TOKEN_TTL_MS),
  });

  return {
    link: `https://t.me/${botUsername}?start=${token}`,
    botUsername,
    botLink: `https://t.me/${botUsername}`,
  };
}

export async function handleTelegramStart({ chat, from, token }) {
  const activeBot = getTelegramBot();
  if (!activeBot || !chat?.id) return;

  try {
    if (!token) {
      const linkedConnection = await findLinkedUserByChat(chat.id);
      if (linkedConnection) {
        await sendTelegramMenu(chat.id);
        return;
      }

      await activeBot.sendMessage(chat.id, "Open NoOr → Community → Link Telegram bot, then press Start from that link.");
      return;
    }

    const tokenHash = hashToken(token);
    const connectToken = await findTelegramConnectToken(tokenHash);

    if (!connectToken || connectToken.usedAt || connectToken.expiresAt <= new Date()) {
      await activeBot.sendMessage(chat.id, "Invalid or expired link.");
      return;
    }

    const markUsed = await markTelegramConnectTokenUsed(connectToken.id);
    if (markUsed.count === 0) {
      await activeBot.sendMessage(chat.id, "Invalid or expired link.");
      return;
    }

    const telegramChatId = String(chat.id);
    const existingConnection = await findTelegramConnectionByChatId(telegramChatId);
    if (existingConnection && existingConnection.userId !== connectToken.userId) {
      await activeBot.sendMessage(chat.id, "Telegram already connected.");
      return;
    }

    await upsertTelegramConnection({
      userId: connectToken.userId,
      telegramChatId,
      telegramUsername: normalizeUsername(from?.username),
      telegramFirstName: from?.first_name || null,
    });

    await activeBot.sendMessage(
      chat.id,
      "✅ Telegram connected successfully!\nYou will now receive notifications here.",
    );
    await sendTelegramMenu(chat.id);
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram start handling failed");
    await activeBot.sendMessage(chat.id, "Could not connect Telegram. Please try again later.").catch(() => {});
  }
}

export async function handleTelegramAction(query) {
  const activeBot = getTelegramBot();
  const chatId = query?.message?.chat?.id;
  if (!activeBot || !chatId) return;

  try {
    await activeBot.answerCallbackQuery(query.id).catch(() => {});

    const connection = await findLinkedUserByChat(chatId);
    if (!connection) {
      await activeBot.sendMessage(chatId, "Telegram is not linked yet. Open NoOr → Community → Link Telegram bot.");
      return;
    }

    if (query.data === telegramActions.menu) {
      pendingPrayerChats.delete(chatIdFrom(chatId));
      await sendTelegramMenu(chatId);
      return;
    }

    if (query.data === telegramActions.addPrayer) {
      pendingPrayerChats.set(chatIdFrom(chatId), connection.userId);
      await activeBot.sendMessage(chatId, "Send your prayer need in one message.", {
        reply_markup: {
          inline_keyboard: [[{ text: "Cancel", callback_data: telegramActions.menu }]],
        },
      });
      return;
    }

    if (query.data === telegramActions.answer) {
      await sendTelegramAnswerMenu(chatId, connection.userId);
      return;
    }

    if (query.data === telegramActions.seePrayers) {
      await sendPrayerList(chatId);
      return;
    }

    if (query.data === telegramActions.answerYes || query.data === telegramActions.answerNo) {
      const answer = query.data === telegramActions.answerYes ? "YES" : "NO";

      try {
        if (answer === "YES") {
          await incrementUserLeaderboard(connection.userId, connection.user.timezone);
        } else {
          await resetUserLeaderboard(connection.userId, connection.user.timezone);
        }
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 409) {
          const status = await getCheckInStatus(connection.userId, connection.user.timezone);
          await activeBot.sendMessage(chatId, `Already answered today: ${status.answer}.`, {
            reply_markup: menuKeyboard(),
          });
          return;
        }

        throw error;
      }

      await activeBot.sendMessage(chatId, answer === "YES" ? "Saved: YES. Streak updated." : "Saved: NO. Streak reset.", {
        reply_markup: menuKeyboard(),
      });
    }
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram action handling failed");
    await activeBot.sendMessage(chatId, "Could not complete this action. Please try again.").catch(() => {});
  }
}

export async function handleTelegramMessage(message) {
  const activeBot = getTelegramBot();
  const chatId = message?.chat?.id;
  if (!activeBot || !chatId || !message.text) return;

  const pendingUserId = pendingPrayerChats.get(chatIdFrom(chatId));
  if (!pendingUserId) return;

  try {
    const prayer = message.text.trim();
    if (prayer.length < 2) {
      await activeBot.sendMessage(chatId, "Prayer is too short. Send a little more detail.");
      return;
    }

    if (prayer.length > 1000) {
      await activeBot.sendMessage(chatId, "Prayer is too long. Please send up to 1000 characters.");
      return;
    }

    const connection = await findLinkedUserByChat(chatId);
    if (!connection || connection.userId !== pendingUserId) {
      pendingPrayerChats.delete(chatIdFrom(chatId));
      await activeBot.sendMessage(chatId, "Telegram is not linked anymore. Open NoOr → Community → Link Telegram bot.");
      return;
    }

    await addPrayer({ userId: pendingUserId, prayer });
    pendingPrayerChats.delete(chatIdFrom(chatId));

    await activeBot.sendMessage(chatId, "Prayer added.", {
      reply_markup: menuKeyboard(),
    });
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram prayer handling failed");
    await activeBot.sendMessage(chatId, "Could not add prayer. Please try again.").catch(() => {});
  }
}

export async function sendTelegramNotification(userId, message) {
  const activeBot = getTelegramBot();
  if (!activeBot) {
    throw new AppError("Bot token missing", 503);
  }

  const connection = await findTelegramConnectionByUserId(userId);
  if (!connection || !connection.isActive) {
    throw new AppError("Telegram is not connected", 409);
  }

  try {
    await activeBot.sendMessage(connection.telegramChatId, message);
    return { success: true };
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error), userId }, "Telegram notification failed");
    throw new AppError("Telegram notification failed", 502);
  }
}

export async function sendDailyAnswerReminders(now = new Date()) {
  const activeBot = getTelegramBot();
  if (!activeBot) return { sent: 0 };

  const connections = await findActiveTelegramConnections();
  let sent = 0;

  for (const connection of connections) {
    if (!shouldRunAtLocalHour(now, connection.user.timezone, getAnswerReminderHour())) continue;

    const userDateKey = getTodayDateKey(now, connection.user.timezone);
    const answeredToday = connection.user.checkIn?.dateKey === userDateKey && connection.user.checkIn?.answer;
    if (answeredToday) continue;

    const claimed = await claimTelegramNotification({
      userId: connection.userId,
      notificationType: notificationTypes.answerReminder,
      dateKey: userDateKey,
    });
    if (!claimed) continue;

    try {
      await activeBot.sendMessage(
        connection.telegramChatId,
        "Answer today before the day ends.",
        { reply_markup: answerKeyboard() },
      );
      sent += 1;
    } catch (error) {
      logger.warn({ telegramError: toSafeTelegramError(error), userId: connection.userId }, "Telegram answer reminder failed");
    }
  }

  return { sent };
}

export async function sendDailyPrayerDigest(now = new Date()) {
  const activeBot = getTelegramBot();
  if (!activeBot) return { sent: 0 };

  const connections = await findActiveTelegramConnections();
  const { getPrayers } = await import("./prayerService.js");
  const message = formatPrayers(await getPrayers());
  let sent = 0;

  for (const connection of connections) {
    if (!shouldRunAtLocalHour(now, connection.user.timezone, PRAYER_DIGEST_HOUR)) continue;

    const userDateKey = getTodayDateKey(now, connection.user.timezone);
    const claimed = await claimTelegramNotification({
      userId: connection.userId,
      notificationType: notificationTypes.prayerDigest,
      dateKey: userDateKey,
    });
    if (!claimed) continue;

    try {
      await activeBot.sendMessage(connection.telegramChatId, message, {
        reply_markup: menuKeyboard(),
      });
      sent += 1;
    } catch (error) {
      logger.warn({ telegramError: toSafeTelegramError(error), userId: connection.userId }, "Telegram prayer digest failed");
    }
  }

  return { sent };
}
