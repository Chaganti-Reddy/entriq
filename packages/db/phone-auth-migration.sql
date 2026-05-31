-- ─── Phone-first auth migration ──────────────────────────────────────────────
-- Run this on Supabase SQL editor BEFORE deploying the new API.

-- 1. Make users.email optional (phone-based users won't have an email)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Add phone auth columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile      TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_verified     BOOLEAN    DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_verified_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash       TEXT;

-- 3. Make orgs.email optional
ALTER TABLE orgs ALTER COLUMN email DROP NOT NULL;

-- 4. OTP verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT        NOT NULL,
  otp_code    TEXT        NOT NULL,
  purpose     TEXT        NOT NULL CHECK (purpose IN ('signup', 'phone_verify', 'forgot_password')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     DEFAULT FALSE,
  attempts    INT         DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose
  ON otp_verifications (phone, purpose, used);

-- 5. Indexes for fast phone lookups
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users (mobile);

-- 6. Make registrations.email nullable (phone-only users have no email)
ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL;
