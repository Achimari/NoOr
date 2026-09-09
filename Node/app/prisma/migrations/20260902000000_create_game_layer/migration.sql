
CREATE TABLE "game_profiles" (
    "id" INTEGER NOT NULL,
    "base_strength" INTEGER NOT NULL DEFAULT 0,
    "base_dexterity" INTEGER NOT NULL DEFAULT 0,
    "base_intelligence" INTEGER NOT NULL DEFAULT 0,
    "allocation_confirmed_at" TIMESTAMP(3),
    "allocation_locked_at" TIMESTAMP(3),
    "emblem_key" TEXT NOT NULL DEFAULT 'dawn',
    "accent_key" TEXT NOT NULL DEFAULT 'neutral',
    "share_today_goals" BOOLEAN NOT NULL DEFAULT false,
    "share_today_bible_reflection" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stat_rewards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stat" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stat_rewards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spell_unlocks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "spell_key" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spell_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pve_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "encounter_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "best_turns" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pve_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_queue_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "active_queue_user_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SEARCHING',
    "rating" INTEGER NOT NULL,
    "battle_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_queue_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battles" (
    "id" SERIAL NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "formula_version" INTEGER NOT NULL,
    "encounter_key" TEXT,
    "winner_user_id" INTEGER,
    "state" JSONB NOT NULL,
    "last_action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "battles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battle_participants" (
    "id" SERIAL NOT NULL,
    "battle_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "active_pvp_user_id" INTEGER,
    "side" TEXT NOT NULL,
    "is_boss" BOOLEAN NOT NULL DEFAULT false,
    "character_snapshot" JSONB NOT NULL,
    "spell_snapshot" JSONB NOT NULL,
    "result" TEXT,

    CONSTRAINT "battle_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "battle_actions" (
    "id" SERIAL NOT NULL,
    "battle_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actor_side" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stat_rewards_user_id_idx" ON "stat_rewards"("user_id");

CREATE INDEX "stat_rewards_user_id_date_key_idx" ON "stat_rewards"("user_id", "date_key");

CREATE UNIQUE INDEX "stat_rewards_user_id_stat_source_date_key_key" ON "stat_rewards"("user_id", "stat", "source", "date_key");

CREATE INDEX "spell_unlocks_user_id_idx" ON "spell_unlocks"("user_id");

CREATE UNIQUE INDEX "spell_unlocks_user_id_spell_key_key" ON "spell_unlocks"("user_id", "spell_key");

CREATE UNIQUE INDEX "pve_progress_user_id_encounter_key_key" ON "pve_progress"("user_id", "encounter_key");

CREATE UNIQUE INDEX "match_queue_entries_active_queue_user_id_key" ON "match_queue_entries"("active_queue_user_id");

CREATE INDEX "match_queue_entries_status_rating_idx" ON "match_queue_entries"("status", "rating");

CREATE INDEX "match_queue_entries_user_id_idx" ON "match_queue_entries"("user_id");

CREATE INDEX "battles_status_idx" ON "battles"("status");

CREATE UNIQUE INDEX "battle_participants_active_pvp_user_id_key" ON "battle_participants"("active_pvp_user_id");

CREATE INDEX "battle_participants_user_id_idx" ON "battle_participants"("user_id");

CREATE UNIQUE INDEX "battle_participants_battle_id_side_key" ON "battle_participants"("battle_id", "side");

CREATE UNIQUE INDEX "battle_actions_battle_id_idempotency_key_key" ON "battle_actions"("battle_id", "idempotency_key");

CREATE UNIQUE INDEX "battle_actions_battle_id_sequence_key" ON "battle_actions"("battle_id", "sequence");

ALTER TABLE "game_profiles" ADD CONSTRAINT "game_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stat_rewards" ADD CONSTRAINT "stat_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spell_unlocks" ADD CONSTRAINT "spell_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pve_progress" ADD CONSTRAINT "pve_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_queue_entries" ADD CONSTRAINT "match_queue_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battle_actions" ADD CONSTRAINT "battle_actions_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "battles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
