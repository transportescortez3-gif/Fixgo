-- Radio de alertas Pro Max configurable por el trabajador (null = sin límite)
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_radius_km INTEGER DEFAULT NULL;
