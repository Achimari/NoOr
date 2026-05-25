CREATE TABLE "CheckIn_new" (
    "id" INTEGER NOT NULL,
    "dateKey" TEXT,
    "answer" TEXT,

    CONSTRAINT "CheckIn_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CheckIn_new" ("id", "dateKey", "answer")
SELECT DISTINCT ON ("userId") "userId", "dateKey", "answer"
FROM "CheckIn"
ORDER BY "userId", "createdAt" DESC, "id" DESC;

INSERT INTO "CheckIn_new" ("id")
SELECT "Auth"."id"
FROM "Auth"
WHERE NOT EXISTS (
    SELECT 1
    FROM "CheckIn_new"
    WHERE "CheckIn_new"."id" = "Auth"."id"
);

DROP TABLE "CheckIn";

ALTER TABLE "CheckIn_new" RENAME TO "CheckIn";
ALTER INDEX "CheckIn_new_pkey" RENAME TO "CheckIn_pkey";

CREATE INDEX "CheckIn_dateKey_idx" ON "CheckIn"("dateKey");

ALTER TABLE "CheckIn"
ADD CONSTRAINT "CheckIn_id_fkey"
FOREIGN KEY ("id") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
