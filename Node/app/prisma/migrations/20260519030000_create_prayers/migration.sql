CREATE TABLE "Prayer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "prayer" TEXT NOT NULL,

    CONSTRAINT "Prayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Prayer_userId_idx" ON "Prayer"("userId");

ALTER TABLE "Prayer"
ADD CONSTRAINT "Prayer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
