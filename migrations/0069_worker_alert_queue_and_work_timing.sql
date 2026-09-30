ALTER TABLE services
  ADD COLUMN IF NOT EXISTS worker_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;

ALTER TABLE alert_sessions
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_id TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS distance_km REAL;

UPDATE alert_sessions
SET expires_at = sent_at + INTERVAL '60 seconds',
    delivered_at = CASE WHEN response = 'pending' THEN sent_at ELSE delivered_at END
WHERE expires_at IS NULL;

ALTER TABLE alert_sessions
  ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_session_delivery_id
  ON alert_sessions (delivery_id)
  WHERE delivery_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_sessions_dispatch
  ON alert_sessions (worker_id, response, available_at, expires_at);

CREATE TABLE IF NOT EXISTS worker_alert_slots (
  worker_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'engaged')),
  delivery_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_alert_slots_service_id
  ON worker_alert_slots (service_id);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'worker_arrived';