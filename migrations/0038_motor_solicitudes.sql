-- Motor de Solicitudes: nuevos estados y tabla de sesiones de alerta

-- Nuevos valores en service_status
ALTER TYPE service_status ADD VALUE IF NOT EXISTS 'alerting';
ALTER TYPE service_status ADD VALUE IF NOT EXISTS 'open';

-- Nuevos valores en proposal_status
ALTER TYPE proposal_status ADD VALUE IF NOT EXISTS 'open_chat';
ALTER TYPE proposal_status ADD VALUE IF NOT EXISTS 'worker_accepted';

-- Cooldown de 4h para expertos que cerraron un trato
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_cooldown_until TIMESTAMPTZ;

-- Tabla de sesiones de alerta activa
CREATE TABLE IF NOT EXISTS alert_sessions (
  id            SERIAL PRIMARY KEY,
  service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  worker_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response      VARCHAR(20) NOT NULL DEFAULT 'pending',
  responded_at  TIMESTAMPTZ,
  CONSTRAINT uq_alert_session UNIQUE (service_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_sessions_service_id ON alert_sessions(service_id);
CREATE INDEX IF NOT EXISTS idx_alert_sessions_worker_id ON alert_sessions(worker_id);
