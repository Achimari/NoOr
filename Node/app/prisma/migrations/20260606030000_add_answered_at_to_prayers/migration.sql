ALTER TABLE "Prayer"
ADD COLUMN "answered_at" TIMESTAMP(3);

CREATE INDEX "Prayer_answered_at_idx" ON "Prayer"("answered_at");
