CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id" serial PRIMARY KEY,
  "blocker_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("blocker_id", "blocked_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocker" ON "user_blocks"("blocker_id");
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked" ON "user_blocks"("blocked_id");
