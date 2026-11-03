ALTER TABLE alert_sessions
  ADD COLUMN IF NOT EXISTS modal_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE alert_sessions
SET modal_expires_at = COALESCE(delivered_at, available_at) + INTERVAL '60 seconds',
    expires_at = GREATEST(
      expires_at,
      COALESCE(delivered_at, available_at) + INTERVAL '120 seconds'
    )
WHERE response = 'pending'
  AND expires_at > NOW()
  AND modal_expires_at IS NULL;
