CREATE TABLE "telegram_notification_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_type" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_notification_logs_user_id_notification_type_date_key_key"
ON "telegram_notification_logs"("user_id", "notification_type", "date_key");

CREATE INDEX "telegram_notification_logs_date_key_idx"
ON "telegram_notification_logs"("date_key");

ALTER TABLE "telegram_notification_logs"
ADD CONSTRAINT "telegram_notification_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
