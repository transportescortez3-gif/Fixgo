-- ============================================================
-- Fixxer - New Features Migration
-- ============================================================

-- Add service_radius to workers (km, default 50)
ALTER TABLE users ADD COLUMN IF NOT EXISTS service_radius INTEGER NOT NULL DEFAULT 50;

-- Add is_urgent to services
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT FALSE;

-- Portfolio images for workers
CREATE TABLE IF NOT EXISTS portfolio_images (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  caption    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio_images(user_id);

-- Professional certifications
CREATE TABLE IF NOT EXISTS certifications (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  issuer           TEXT,
  image_url        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  verified_by      INTEGER REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certifications_user_id ON certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_certifications_status  ON certifications(status);

-- Dispute / mediation system
CREATE TABLE IF NOT EXISTS disputes (
  id          SERIAL PRIMARY KEY,
  service_id  INTEGER NOT NULL REFERENCES services(id),
  opened_by   INTEGER NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_service_id ON disputes(service_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status     ON disputes(status);
