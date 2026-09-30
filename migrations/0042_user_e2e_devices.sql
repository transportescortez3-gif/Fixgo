-- Dispositivos de confianza para restaurar el respaldo de la llave E2E,
-- validados contra el teléfono verificado de la cuenta (estilo WhatsApp).
CREATE TABLE IF NOT EXISTS user_e2e_devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  verified_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_e2e_devices_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_e2e_devices_user_id ON user_e2e_devices(user_id);
