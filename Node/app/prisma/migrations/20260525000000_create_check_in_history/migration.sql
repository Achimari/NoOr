CREATE TABLE "check_in_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "check_in_history_user_id_date_key_key"
ON "check_in_history"("user_id", "date_key");

CREATE INDEX "check_in_history_date_key_idx"
ON "check_in_history"("date_key");

INSERT INTO "check_in_history" ("user_id", "date_key", "answer")
SELECT "id", "dateKey", "answer"
FROM "CheckIn"
WHERE "dateKey" IS NOT NULL
  AND "answer" IS NOT NULL
ON CONFLICT ("user_id", "date_key") DO NOTHING;

ALTER TABLE "check_in_history"
ADD CONSTRAINT "check_in_history_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
