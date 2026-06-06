WITH yes_rows AS (
    SELECT
        "user_id",
        "date_key"::date AS "date_value",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id"
            ORDER BY "date_key"::date
        ) AS "row_number"
    FROM "check_in_history"
    WHERE "answer" = 'YES'
      AND "date_key" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
),
streak_groups AS (
    SELECT
        "user_id",
        "date_value" - ("row_number"::int * INTERVAL '1 day') AS "group_key",
        COUNT(*) AS "streak"
    FROM yes_rows
    GROUP BY "user_id", "group_key"
),
max_streaks AS (
    SELECT
        "user_id",
        MAX("streak")::int AS "max_streak"
    FROM streak_groups
    GROUP BY "user_id"
)
UPDATE "Leaderboard"
SET "max_streak" = GREATEST("Leaderboard"."max_streak", max_streaks."max_streak")
FROM max_streaks
WHERE "Leaderboard"."id" = max_streaks."user_id";
