CREATE TABLE "daily_goal_check_ins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date_key" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_goal_check_ins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_goal_check_ins_answer_check" CHECK ("answer" IN ('YES', 'NO'))
);

CREATE UNIQUE INDEX "daily_goal_check_ins_user_id_date_key_key"
ON "daily_goal_check_ins"("user_id", "date_key");

CREATE INDEX "daily_goal_check_ins_date_key_idx"
ON "daily_goal_check_ins"("date_key");

ALTER TABLE "daily_goal_check_ins"
ADD CONSTRAINT "daily_goal_check_ins_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
