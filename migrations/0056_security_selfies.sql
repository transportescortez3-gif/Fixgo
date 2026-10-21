-- 0056: Registro administrativo y retención de selfies de seguridad.
CREATE TABLE IF NOT EXISTS security_selfies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  service_id INTEGER REFERENCES services(id),
  proposal_id INTEGER REFERENCES proposals(id),
  purpose TEXT NOT NULL,
  object_path TEXT,
  original_object_path TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_selfies_user_id ON security_selfies(user_id);
CREATE INDEX IF NOT EXISTS idx_security_selfies_service_id ON security_selfies(service_id);
CREATE INDEX IF NOT EXISTS idx_security_selfies_expires_at ON security_selfies(expires_at);
CREATE INDEX IF NOT EXISTS idx_security_selfies_object_paths ON security_selfies(object_path, original_object_path);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_selfie_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Compatibilidad: registrar selfies que ya estaban asociadas a servicios o
-- propuestas antes de existir esta tabla. La fecha de vencimiento conserva
-- cinco días hábiles desde la captura.
INSERT INTO security_selfies (
  user_id, role, service_id, purpose, object_path, original_object_path,
  taken_at, expires_at
)
SELECT
  s.client_id,
  'client',
  s.id,
  'service_publish',
  s.client_selfie_url,
  s.client_selfie_url,
  COALESCE(s.client_selfie_taken_at, s.created_at),
  COALESCE(s.client_selfie_taken_at, s.created_at)
    + CASE EXTRACT(DOW FROM COALESCE(s.client_selfie_taken_at, s.created_at))
        WHEN 0 THEN INTERVAL '5 days'
        WHEN 6 THEN INTERVAL '6 days'
        ELSE INTERVAL '7 days'
      END
FROM services s
WHERE s.client_selfie_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM security_selfies ss
    WHERE ss.original_object_path = s.client_selfie_url
  );

INSERT INTO security_selfies (
  user_id, role, service_id, purpose, object_path, original_object_path,
  taken_at, expires_at
)
SELECT
  s.worker_id,
  'worker',
  s.id,
  'proposal_accept',
  s.worker_selfie_url,
  s.worker_selfie_url,
  COALESCE(s.worker_selfie_taken_at, s.created_at),
  COALESCE(s.worker_selfie_taken_at, s.created_at)
    + CASE EXTRACT(DOW FROM COALESCE(s.worker_selfie_taken_at, s.created_at))
        WHEN 0 THEN INTERVAL '5 days'
        WHEN 6 THEN INTERVAL '6 days'
        ELSE INTERVAL '7 days'
      END
FROM services s
WHERE s.worker_id IS NOT NULL
  AND s.worker_selfie_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM security_selfies ss
    WHERE ss.original_object_path = s.worker_selfie_url
  );

INSERT INTO security_selfies (
  user_id, service_id, proposal_id, role, purpose, object_path, original_object_path,
  taken_at, expires_at
)
SELECT
  p.worker_id,
  p.service_id,
  p.id,
  'worker',
  'proposal',
  p.worker_selfie_url,
  p.worker_selfie_url,
  p.created_at,
  p.created_at
    + CASE EXTRACT(DOW FROM p.created_at)
        WHEN 0 THEN INTERVAL '5 days'
        WHEN 6 THEN INTERVAL '6 days'
        ELSE INTERVAL '7 days'
      END
FROM proposals p
WHERE p.worker_selfie_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM security_selfies ss
    WHERE ss.original_object_path = p.worker_selfie_url
  );