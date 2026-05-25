import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectWithRetry, prisma } from "./prisma/client.js";
import { startTelegramBot, stopTelegramBot } from "./services/telegramBotService.js";
import { startTelegramNotificationScheduler, stopTelegramNotificationScheduler } from "./services/telegramNotificationScheduler.js";
import { logger } from "./utils/logger.js";

const app = createApp();

async function startServer() {
  await connectWithRetry();
  await startTelegramBot();
  startTelegramNotificationScheduler();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Node app started");
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "Graceful shutdown started");
    server.close(async () => {
      stopTelegramNotificationScheduler();
      await stopTelegramBot();
      await prisma.$disconnect();
      logger.info("Graceful shutdown completed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch(async (error) => {
  logger.error({ err: error }, "Failed to start server");
  await prisma.$disconnect();
  process.exit(1);
});
