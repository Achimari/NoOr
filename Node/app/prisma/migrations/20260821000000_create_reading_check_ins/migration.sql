CREATE TABLE "reading_check_ins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "reflection" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reading_passages" (
    "id" SERIAL NOT NULL,
    "reading_check_in_id" INTEGER NOT NULL,
    "book_code" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "start_verse" INTEGER NOT NULL,
    "end_verse" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "reading_passages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reading_check_ins_user_id_date_key_key"
ON "reading_check_ins"("user_id", "date_key");

CREATE INDEX "reading_check_ins_date_key_idx"
ON "reading_check_ins"("date_key");

CREATE INDEX "reading_passages_reading_check_in_id_idx"
ON "reading_passages"("reading_check_in_id");

ALTER TABLE "reading_check_ins"
ADD CONSTRAINT "reading_check_ins_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reading_passages"
ADD CONSTRAINT "reading_passages_reading_check_in_id_fkey"
FOREIGN KEY ("reading_check_in_id") REFERENCES "reading_check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
