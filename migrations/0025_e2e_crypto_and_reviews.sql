-- Fase 3: Tabla de claves públicas para chat E2E
CREATE TABLE IF NOT EXISTS user_crypto_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fase 6: Campo "recomienda" en reseñas (para métricas de perfil)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS recommends BOOLEAN DEFAULT NULL;
