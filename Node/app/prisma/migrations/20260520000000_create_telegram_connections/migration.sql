ALTER TABLE "Auth"
ADD COLUMN "is_telegram_linked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "telegram_connections" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "telegram_first_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_connections_user_id_key" ON "telegram_connections"("user_id");
CREATE UNIQUE INDEX "telegram_connections_telegram_chat_id_key" ON "telegram_connections"("telegram_chat_id");

ALTER TABLE "telegram_connections"
ADD CONSTRAINT "telegram_connections_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_connect_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_connect_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_connect_tokens_token_hash_key" ON "telegram_connect_tokens"("token_hash");
CREATE INDEX "telegram_connect_tokens_user_id_idx" ON "telegram_connect_tokens"("user_id");
CREATE INDEX "telegram_connect_tokens_expires_at_idx" ON "telegram_connect_tokens"("expires_at");

ALTER TABLE "telegram_connect_tokens"
ADD CONSTRAINT "telegram_connect_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Auth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
