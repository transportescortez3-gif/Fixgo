ALTER TABLE services
  ADD COLUMN IF NOT EXISTS free_cancel_end_notified_at TIMESTAMPTZ;

-- No enviar tarde los avisos de gracia a trabajos que ya se iniciaron antes
-- de desplegar esta migración.
UPDATE services
SET free_cancel_end_notified_at = COALESCE(free_cancel_until, NOW())
WHERE work_started_at IS NOT NULL
  AND free_cancel_until IS NOT NULL
  AND free_cancel_until <= NOW()
  AND free_cancel_end_notified_at IS NULL;
