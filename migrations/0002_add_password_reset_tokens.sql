-- Migration: Add password reset tokens table
-- Created for forgot password functionality

CREATE TABLE IF NOT EXISTS "mvp_password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "mvp_users"("id") ON DELETE CASCADE,
  "token" varchar(255) NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

-- Index on token for fast lookups during password reset
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_token" ON "mvp_password_reset_tokens"("token");

-- Index on user_id for finding user's reset tokens
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user_id" ON "mvp_password_reset_tokens"("user_id");

-- Index on expires_at for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_expires_at" ON "mvp_password_reset_tokens"("expires_at");

