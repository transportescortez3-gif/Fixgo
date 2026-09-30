ALTER TABLE "account_deletion_requests"
  ADD COLUMN IF NOT EXISTS "request_type" TEXT NOT NULL DEFAULT 'full';

ALTER TABLE "account_deletion_requests"
  ADD COLUMN IF NOT EXISTS "data_categories" TEXT[] NOT NULL DEFAULT '{}';