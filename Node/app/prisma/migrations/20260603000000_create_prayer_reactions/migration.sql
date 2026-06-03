CREATE TABLE "prayer_reactions" (
    "id" SERIAL NOT NULL,
    "prayer_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayer_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prayer_reactions_prayer_id_user_id_key"
ON "prayer_reactions"("prayer_id", "user_id");

CREATE INDEX "prayer_reactions_user_id_idx"
ON "prayer_reactions"("user_id");

ALTER TABLE "prayer_reactions"
ADD CONSTRAINT "prayer_reactions_prayer_id_fkey"
FOREIGN KEY ("prayer_id") REFERENCES "Prayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prayer_reactions"
ADD CONSTRAINT "prayer_reactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
