-- Método de pago elegido por el cliente al publicar (efectivo o transferencia),
-- confirmación de término por parte del cliente (flujo de doble confirmación),
-- y nuevo tipo de notificación para cancelaciones (tarjetas en la pantalla de inicio).

ALTER TABLE services ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS client_completed_at timestamptz;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'service_cancelled';
