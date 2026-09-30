-- Composite indexes for services list queries (ORDER BY created_at)
CREATE INDEX IF NOT EXISTS idx_services_status_created
  ON services(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_services_client_created
  ON services(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_services_worker_created
  ON services(worker_id, created_at DESC);

-- Index for notifications feed (most common query: by user + unread)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, is_read, created_at DESC);
