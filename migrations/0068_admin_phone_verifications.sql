CREATE TABLE IF NOT EXISTS admin_phone_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual_admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_phone_verifications_user_id
  ON admin_phone_verifications(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_phone_verifications_created_at
  ON admin_phone_verifications(created_at);