CREATE TABLE "Leaderboard" (
    "id" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Leaderboard_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Leaderboard"
ADD CONSTRAINT "Leaderboard_id_fkey"
FOREIGN KEY ("id") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
