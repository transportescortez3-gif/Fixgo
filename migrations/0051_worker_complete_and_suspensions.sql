-- Cambio 1: el experto puede marcar "Trabajo realizado" (auto-completa en 24h)
ALTER TABLE services ADD COLUMN IF NOT EXISTS worker_completed_at timestamptz;
-- Timestamp explícito de cancelación (para contar cancelaciones por mes)
ALTER TABLE services ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Cambio 2: suspensiones automáticas escalonadas por cancelaciones del experto
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_count integer NOT NULL DEFAULT 0;

-- Nuevos tipos de notificación
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'work_done_confirm';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'account_suspension';
