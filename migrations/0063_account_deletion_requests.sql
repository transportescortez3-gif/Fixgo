CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "name" TEXT,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "message" TEXT,
  "admin_notes" TEXT,
  "reviewed_by" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_status"
  ON "account_deletion_requests" ("status");

CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_email"
  ON "account_deletion_requests" ("email");

CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_created_at"
  ON "account_deletion_requests" ("created_at");