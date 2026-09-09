CREATE TABLE "daily_goals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_goals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "daily_goals"
ADD CONSTRAINT "daily_goals_position_range_check"
CHECK ("position" >= 1 AND "position" <= 5);

CREATE UNIQUE INDEX "daily_goals_user_id_date_key_position_key"
ON "daily_goals"("user_id", "date_key", "position");

CREATE INDEX "daily_goals_user_id_date_key_idx"
ON "daily_goals"("user_id", "date_key");

ALTER TABLE "daily_goals"
ADD CONSTRAINT "daily_goals_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
