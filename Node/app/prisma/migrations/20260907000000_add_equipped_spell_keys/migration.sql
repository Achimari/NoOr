
ALTER TABLE "game_profiles"
ADD COLUMN "equipped_spell_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "game_profiles" AS p
SET "equipped_spell_keys" = first_three.keys
FROM (
    SELECT
        ranked."user_id",
        ARRAY_AGG(ranked."spell_key" ORDER BY ranked."position") AS keys
    FROM (
        SELECT
            u."user_id",
            u."spell_key",
            ROW_NUMBER() OVER (
                PARTITION BY u."user_id"
                ORDER BY u."unlocked_at" ASC, u."spell_key" ASC
            ) AS "position"
        FROM "spell_unlocks" AS u
    ) AS ranked
    WHERE ranked."position" <= 3
    GROUP BY ranked."user_id"
) AS first_three
WHERE p."id" = first_three."user_id"
  AND COALESCE(ARRAY_LENGTH(p."equipped_spell_keys", 1), 0) = 0;
