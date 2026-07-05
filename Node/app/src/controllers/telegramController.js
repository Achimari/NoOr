import { createTelegramConnectLink, sendTelegramNotification } from "../services/telegramService.js";

export async function getTelegramConnectLink(req, res) {
  const telegramConnect = await createTelegramConnectLink(req.user.id);
  return res.json(telegramConnect);
}

export async function sendTelegramTestNotification(req, res) {
  await sendTelegramNotification(req.user.id, "NoOr test notification.");
  return res.json({ success: true });
}
