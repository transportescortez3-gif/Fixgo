-- Late-cancellation suspensions are always 24 hours.
-- Older versions could leave workers blocked for 7 or 30 days; shorten only
-- active automatic suspensions that still exceed the new policy.
UPDATE users
SET suspended_until = NOW() + INTERVAL '24 hours'
WHERE role = 'worker'
  AND suspended_until IS NOT NULL
  AND suspended_until > NOW() + INTERVAL '24 hours';