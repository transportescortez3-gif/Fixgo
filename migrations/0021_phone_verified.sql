ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_phone_verified ON users(phone_verified);
