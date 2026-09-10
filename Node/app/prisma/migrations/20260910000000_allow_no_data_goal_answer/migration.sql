-- Tasks days that were never answered are recorded as NO_DATA, so the answer
-- check has to admit the third state alongside the two a user can choose.
ALTER TABLE "daily_goal_check_ins"
DROP CONSTRAINT IF EXISTS "daily_goal_check_ins_answer_check";

ALTER TABLE "daily_goal_check_ins"
ADD CONSTRAINT "daily_goal_check_ins_answer_check" CHECK ("answer" IN ('YES', 'NO', 'NO_DATA'));
