CREATE TABLE "achievement_unlocks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "achievement_key" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "achievement_unlocks_user_id_achievement_key_key"
ON "achievement_unlocks"("user_id", "achievement_key");

CREATE INDEX "achievement_unlocks_user_id_unlocked_at_idx"
ON "achievement_unlocks"("user_id", "unlocked_at");

ALTER TABLE "achievement_unlocks"
ADD CONSTRAINT "achievement_unlocks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
