-- Agrega el radio de alertas para trabajadores Pro Max (en km, null = ilimitado)
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_radius_km INTEGER;
