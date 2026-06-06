CREATE TABLE "missed_days" (
    "id" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "dates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "missed_days_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "missed_days"
ADD CONSTRAINT "missed_days_id_fkey"
FOREIGN KEY ("id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
