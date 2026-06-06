ALTER TABLE "Leaderboard"
ADD COLUMN "max_streak" INTEGER NOT NULL DEFAULT 0;

UPDATE "Leaderboard"
SET "max_streak" = "value"
WHERE "max_streak" < "value";
