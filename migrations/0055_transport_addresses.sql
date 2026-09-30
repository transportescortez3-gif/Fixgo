-- 0055: Direcciones separadas para servicios de Transporte y Logística.
ALTER TABLE services ADD COLUMN IF NOT EXISTS origin_address TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS destination_address TEXT;