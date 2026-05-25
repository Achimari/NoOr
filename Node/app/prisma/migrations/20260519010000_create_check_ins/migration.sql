CREATE TABLE "CheckIn" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dateKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckIn_userId_dateKey_key" ON "CheckIn"("userId", "dateKey");
CREATE INDEX "CheckIn_dateKey_idx" ON "CheckIn"("dateKey");

ALTER TABLE "CheckIn"
ADD CONSTRAINT "CheckIn_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
