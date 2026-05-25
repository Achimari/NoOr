import { createTelegramConnectLink, sendTelegramNotification } from "../services/telegramService.js";
import { AppError } from "../utils/appError.js";

export async function getTelegramConnectLink(req, res) {
  try {
    const telegramConnect = await createTelegramConnectLink(req.user.id);
    return res.json(telegramConnect);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}

export async function sendTelegramTestNotification(req, res) {
  try {
    await sendTelegramNotification(req.user.id, "NoOr test notification.");
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
}
