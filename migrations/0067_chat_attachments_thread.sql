ALTER TABLE chat_attachments
  ADD COLUMN IF NOT EXISTS worker_id integer REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_worker_id
  ON chat_attachments(worker_id);

-- Los adjuntos creados después de un acuerdo ya tenían un único hilo posible.
-- Backfill para conservarlos accesibles tras añadir el aislamiento por workerId.
UPDATE chat_attachments AS attachment
SET worker_id = service.worker_id
FROM services AS service
WHERE attachment.worker_id IS NULL
  AND attachment.service_id = service.id
  AND service.worker_id IS NOT NULL;