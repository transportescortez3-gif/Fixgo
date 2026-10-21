-- Tabla de contactos de confianza
CREATE TABLE IF NOT EXISTS user_favorites (
  id serial PRIMARY KEY,
  vinculador_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vinculado_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo_relacion text NOT NULL CHECK (tipo_relacion IN ('cliente_a_experto', 'experto_a_cliente')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (vinculador_id, vinculado_id, tipo_relacion)
);
CREATE INDEX IF NOT EXISTS idx_favorites_vinculador ON user_favorites(vinculador_id);
CREATE INDEX IF NOT EXISTS idx_favorites_vinculado ON user_favorites(vinculado_id);

-- Solicitudes directas en la tabla de servicios
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_direct_request boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS direct_worker_id integer REFERENCES users(id);

-- Nuevo tipo de notificación para solicitud directa rechazada
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'direct_rejected';
