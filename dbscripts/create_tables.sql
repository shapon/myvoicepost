-- =============================================================================
-- MyVoicePost — Database Setup Script
-- =============================================================================
-- Run this script once against a fresh PostgreSQL database to create all
-- tables and insert the required seed data.
--
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS and INSERT ... ON CONFLICT
-- DO NOTHING / DO UPDATE so existing data is never overwritten accidentally.
--
-- Table creation order respects FK dependencies:
--   1. Independent tables first
--   2. Tables with FK references after their parents
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- provides gen_random_uuid()


-- ===========================================================================
-- 1. USERS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_users (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  username              VARCHAR(255)  NOT NULL,
  email                 VARCHAR(255)  NOT NULL UNIQUE,
  password_hash         VARCHAR(255)  NOT NULL,
  role                  VARCHAR(20)   NOT NULL DEFAULT 'GUEST',
  trial_starts_at       TIMESTAMP,
  trial_ends_at         TIMESTAMP,
  trial_used            BOOLEAN       DEFAULT FALSE,
  trial_minutes_total   INTEGER       DEFAULT 90,
  trial_minutes_used    NUMERIC(10,2) DEFAULT 0,
  stripe_customer_id    VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  active_session_id     VARCHAR(64),
  created_at            TIMESTAMP     DEFAULT NOW(),
  updated_at            TIMESTAMP     DEFAULT NOW()
);


-- ===========================================================================
-- 2. SUBSCRIPTION PLANS  (no FK — must exist before user_subscriptions)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_subscription_plans (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      VARCHAR(50)  NOT NULL UNIQUE,
  valid_total_minutes       INTEGER,
  valid_days                INTEGER      NOT NULL,
  recordings_available_days INTEGER      NOT NULL,
  chunks_count              INTEGER      NOT NULL,
  offline_recording         BOOLEAN      NOT NULL DEFAULT FALSE,
  price_monthly             INTEGER      NOT NULL DEFAULT 0,
  stripe_price_id           VARCHAR(255),
  is_default                BOOLEAN      DEFAULT FALSE,
  is_visible                BOOLEAN      DEFAULT TRUE,
  created_at                TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 3. USER SSO ACCOUNTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_user_sso_accounts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES mvp_users(id) ON DELETE CASCADE,
  provider          VARCHAR(50)  NOT NULL,
  provider_user_id  VARCHAR(255) NOT NULL,
  provider_email    VARCHAR(255),
  provider_name     VARCHAR(255),
  provider_avatar   VARCHAR(500),
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMP,
  created_at        TIMESTAMP    DEFAULT NOW(),
  updated_at        TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 4. SAVED TEXTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_saved_texts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES mvp_users(id),
  type            VARCHAR(50)   NOT NULL,           -- 'polish' | 'translate'
  original_text   TEXT          NOT NULL,
  polished_text   TEXT          NOT NULL,
  translated_text TEXT,                             -- translate type only
  source_language VARCHAR(10)   NOT NULL,
  target_language VARCHAR(10),                      -- translate type only
  output_format   VARCHAR(50)   NOT NULL,
  output_type     VARCHAR(50),                      -- polish type only
  created_at      TIMESTAMP     DEFAULT NOW()
);


-- ===========================================================================
-- 5. PASSWORD RESET TOKENS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_password_reset_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES mvp_users(id),
  token       VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMP    NOT NULL,
  used        BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 6. USER SUBSCRIPTIONS  (references users and plans — no enforced FK in ORM)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_user_subscriptions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL,
  plan_id           UUID          NOT NULL,
  valid_date_upto   TIMESTAMP     NOT NULL,
  minutes_used      INTEGER       NOT NULL DEFAULT 0,
  chunks_used       INTEGER       NOT NULL DEFAULT 0,
  minutes_remaining NUMERIC(10,2) DEFAULT 0,
  payment_token     VARCHAR(255),
  status            VARCHAR(20)   NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP     DEFAULT NOW()
);


-- ===========================================================================
-- 7. USER SETTINGS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_user_settings (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES mvp_users(id),
  setting_key   VARCHAR(100)  NOT NULL,
  setting_value TEXT          NOT NULL,
  created_at    TIMESTAMP     DEFAULT NOW(),
  updated_at    TIMESTAMP     DEFAULT NOW()
);


-- ===========================================================================
-- 8. AUDIO LOG
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_audio_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES mvp_users(id),
  usage_time      VARCHAR(20)  NOT NULL,
  usage_seconds   INTEGER      NOT NULL DEFAULT 0,
  source_language VARCHAR(10)  NOT NULL,
  created_at      TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 9. EMAIL OTPs
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_email_otps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  otp         VARCHAR(6)   NOT NULL,
  expires_at  TIMESTAMP    NOT NULL,
  verified    BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 10. SUPPORT REQUESTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_support_requests (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         REFERENCES mvp_users(id),   -- nullable
  email       VARCHAR(255) NOT NULL,
  subject     VARCHAR(500) NOT NULL,
  message     TEXT         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'open',
  platform    VARCHAR(20)  NOT NULL DEFAULT 'web',
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 11. ERROR LOGS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_error_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         REFERENCES mvp_users(id),  -- nullable
  error_message TEXT         NOT NULL,
  error_stack   TEXT,
  error_code    VARCHAR(50),
  platform      VARCHAR(20)  NOT NULL DEFAULT 'web',
  endpoint      VARCHAR(500),
  metadata      TEXT,
  created_at    TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 12. PUSH TOKENS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_push_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL,
  push_token  VARCHAR(255) NOT NULL,
  platform    VARCHAR(20)  NOT NULL DEFAULT 'expo',
  device_id   VARCHAR(255),
  is_active   BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 13. APP SETTINGS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_app_settings (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT         NOT NULL,
  created_at    TIMESTAMP    DEFAULT NOW(),
  updated_at    TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 14. CRASH REPORTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_crash_reports (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source        VARCHAR(20)  NOT NULL,
  error_message TEXT         NOT NULL,
  stack_trace   TEXT,
  user_id       UUID,
  device_info   TEXT,
  app_version   VARCHAR(20),
  endpoint      VARCHAR(255),
  email_sent    BOOLEAN      DEFAULT FALSE,
  created_at    TIMESTAMP    DEFAULT NOW()
);


-- ===========================================================================
-- 15. NOTIFICATION LOG
-- ===========================================================================
CREATE TABLE IF NOT EXISTS mvp_notification_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  subscription_id   UUID,
  sent_at           TIMESTAMP   DEFAULT NOW(),
  status            VARCHAR(20) DEFAULT 'sent',
  message           TEXT
);


-- ===========================================================================
-- INDEXES  (performance for common query patterns)
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_mvp_users_email
  ON mvp_users(email);

CREATE INDEX IF NOT EXISTS idx_mvp_users_stripe_customer
  ON mvp_users(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_mvp_sso_user_id
  ON mvp_user_sso_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_mvp_sso_provider
  ON mvp_user_sso_accounts(provider, provider_user_id);

CREATE INDEX IF NOT EXISTS idx_mvp_saved_texts_user_id
  ON mvp_saved_texts(user_id);

CREATE INDEX IF NOT EXISTS idx_mvp_saved_texts_type
  ON mvp_saved_texts(user_id, type);

CREATE INDEX IF NOT EXISTS idx_mvp_password_reset_token
  ON mvp_password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_mvp_user_subscriptions_user
  ON mvp_user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_mvp_user_subscriptions_status
  ON mvp_user_subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_mvp_user_settings_user
  ON mvp_user_settings(user_id, setting_key);

CREATE INDEX IF NOT EXISTS idx_mvp_audio_log_user
  ON mvp_audio_log(user_id);

CREATE INDEX IF NOT EXISTS idx_mvp_email_otps_email
  ON mvp_email_otps(email);

CREATE INDEX IF NOT EXISTS idx_mvp_push_tokens_user
  ON mvp_push_tokens(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_mvp_push_tokens_token
  ON mvp_push_tokens(push_token);

CREATE INDEX IF NOT EXISTS idx_mvp_notification_log_user
  ON mvp_notification_log(user_id);


-- ===========================================================================
-- SEED DATA
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Subscription Plans
-- Four plans: Free (trial week), Starter, Pro, Top-Up (hidden)
-- stripe_price_id must be updated with real Stripe price IDs before go-live.
-- ---------------------------------------------------------------------------
INSERT INTO mvp_subscription_plans
  (name, valid_total_minutes, valid_days, recordings_available_days,
   chunks_count, offline_recording, price_monthly, is_default, is_visible)
VALUES
  -- Free trial plan: 60 min total, 7-day window, no chunked/offline
  ('Free',    60,   7,  7,  0, FALSE,    0, TRUE,  TRUE),
  -- Starter: 3 000 min / month, 10 chunked recordings, offline enabled
  ('Starter', 3000, 30, 60, 10, TRUE,  999, FALSE, TRUE),
  -- Pro: unlimited minutes / month, 90 chunked recordings, offline enabled
  ('Pro',     NULL, 30, 90, 90, TRUE, 2499, FALSE, TRUE),
  -- Top-Up: 60 min add-on, not shown in plan listing
  ('Top-Up',  60,   0,  0,  0, FALSE,  500, FALSE, FALSE)
ON CONFLICT (name) DO UPDATE SET
  valid_total_minutes       = EXCLUDED.valid_total_minutes,
  valid_days                = EXCLUDED.valid_days,
  recordings_available_days = EXCLUDED.recordings_available_days,
  chunks_count              = EXCLUDED.chunks_count,
  offline_recording         = EXCLUDED.offline_recording,
  price_monthly             = EXCLUDED.price_monthly,
  is_visible                = EXCLUDED.is_visible;


-- ---------------------------------------------------------------------------
-- App Settings — initial admin email placeholder
-- Replace the value with a real admin address before go-live.
-- ---------------------------------------------------------------------------
INSERT INTO mvp_app_settings (setting_key, setting_value)
VALUES ('admin_mail', 'admin@myvoicepost.com')
ON CONFLICT (setting_key) DO NOTHING;
