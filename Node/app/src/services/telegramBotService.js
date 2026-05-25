import TelegramBot from "node-telegram-bot-api";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { toSafeTelegramError } from "../utils/telegramError.js";

let bot;
let botUsername;

export function getTelegramBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return null;
  }

  if (!bot) {
    bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });
  }

  return bot;
}

export async function getTelegramBotUsername() {
  const activeBot = getTelegramBot();
  if (!activeBot) return null;

  if (!botUsername) {
    const me = await activeBot.getMe();
    botUsername = me.username;
  }

  return botUsername;
}

export async function startTelegramBot() {
  const activeBot = getTelegramBot();
  if (!activeBot) {
    logger.warn("Telegram bot token missing; bot polling disabled");
    return;
  }

  try {
    activeBot.onText(/^\/start(?:\s+(.+))?$/, async (message, match) => {
      const { handleTelegramStart } = await import("./telegramService.js");
      await handleTelegramStart({
        chat: message.chat,
        from: message.from,
        token: match?.[1],
      });
    });

    activeBot.on("callback_query", async (query) => {
      const { handleTelegramAction } = await import("./telegramService.js");
      await handleTelegramAction(query);
    });

    activeBot.on("message", async (message) => {
      if (!message.text || message.text.startsWith("/")) return;

      const { handleTelegramMessage } = await import("./telegramService.js");
      await handleTelegramMessage(message);
    });

    activeBot.on("polling_error", (error) => {
      logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram polling error");
      if (error?.response?.statusCode === 409) {
        activeBot.stopPolling().catch((stopError) => {
          logger.warn({ telegramError: toSafeTelegramError(stopError) }, "Telegram polling could not stop after conflict");
        });
      }
    });

    await activeBot.startPolling();
    logger.info("Telegram bot polling started");
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram bot polling could not start");
  }
}

export async function stopTelegramBot() {
  if (!bot) return;

  try {
    await bot.stopPolling();
  } catch (error) {
    logger.warn({ telegramError: toSafeTelegramError(error) }, "Telegram bot polling could not stop cleanly");
  }
}
