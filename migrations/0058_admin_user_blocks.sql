CREATE TABLE IF NOT EXISTS "admin_user_blocks" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_by_admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "duration" text NOT NULL,
  "blocked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "blocked_until" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "end_reason" text,
  "unblocked_by_admin_id" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_admin_user_blocks_user_id"
  ON "admin_user_blocks"("user_id");

CREATE INDEX IF NOT EXISTS "idx_admin_user_blocks_active_until"
  ON "admin_user_blocks"("ended_at", "blocked_until");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_admin_user_blocks_one_active"
  ON "admin_user_blocks"("user_id")
  WHERE "ended_at" IS NULL;

-- Los bloqueos existentes no tenían duración ni autor registrados. Se
-- conservan como bloqueos indefinidos para que no desaparezcan del panel.
INSERT INTO "admin_user_blocks" ("user_id", "duration", "blocked_at")
SELECT u."id", 'indefinite', COALESCE(u."updated_at", now())
FROM "users" u
WHERE u."status" = 'blocked'
  AND NOT EXISTS (
    SELECT 1
    FROM "admin_user_blocks" b
    WHERE b."user_id" = u."id" AND b."ended_at" IS NULL
  );