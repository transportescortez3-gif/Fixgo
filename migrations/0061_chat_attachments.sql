-- Adjuntos privados del chat cifrado E2E.
-- La copia E2E se elimina al cerrar el servicio; la copia de soporte se purga
-- siete días después. Todas las operaciones son idempotentes.
CREATE TABLE IF NOT EXISTS "chat_attachments" (
  "id" serial PRIMARY KEY,
  "service_id" integer NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "message_id" integer REFERENCES "messages"("id") ON DELETE CASCADE,
  "uploader_id" integer NOT NULL REFERENCES "users"("id"),
  "original_name" text NOT NULL,
  "content_type" text NOT NULL,
  "category" text NOT NULL,
  "size" integer NOT NULL,
  "e2e_object_path" text,
  "support_object_path" text,
  "status" text NOT NULL DEFAULT 'pending',
  "support_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "e2e_deleted_at" timestamptz,
  "support_deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_chat_attachments_service_id" ON "chat_attachments" ("service_id");
CREATE INDEX IF NOT EXISTS "idx_chat_attachments_message_id" ON "chat_attachments" ("message_id");
CREATE INDEX IF NOT EXISTS "idx_chat_attachments_support_expires_at" ON "chat_attachments" ("support_expires_at");