-- Agrega el tipo de notificación para vencimiento de suscripciones
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_expiry';
