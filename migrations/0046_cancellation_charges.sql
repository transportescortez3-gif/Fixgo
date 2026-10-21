-- Sistema de cancelación tardía / cobro de visita técnica.
-- IMPORTANTE: idempotente (IF NOT EXISTS) porque el entorno de desarrollo ya
-- recibió estos cambios vía SQL directo; en producción se aplican aquí.

-- Ventana de cancelación gratis: 10 min desde que el cliente confirma al experto
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "free_cancel_until" timestamptz;

-- Nuevo tipo de notificación
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'cancellation_charge';

-- Cargo por cancelación tardía (visita técnica).
-- Legal: Fixxer NO procesa ni intermedia este pago; solo guarda el snapshot de
-- los datos de transferencia del experto y el comprobante que sube el cliente.
CREATE TABLE IF NOT EXISTS "cancellation_charges" (
  "id" serial PRIMARY KEY,
  "service_id" integer NOT NULL UNIQUE REFERENCES "services"("id"),
  "client_id" integer NOT NULL REFERENCES "users"("id"),
  "worker_id" integer NOT NULL REFERENCES "users"("id"),
  "amount" integer NOT NULL,
  "holder_name" text NOT NULL,
  "bank_name" text,
  "bank_account_type" text,
  "bank_account_number" text,
  "bank_rut" text,
  "status" text NOT NULL DEFAULT 'pending',
  "receipt_url" text,
  "receipt_uploaded_at" timestamptz,
  "settled_at" timestamptz,
  "deadline_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_cancellation_charges_client_id" ON "cancellation_charges" ("client_id");
CREATE INDEX IF NOT EXISTS "idx_cancellation_charges_worker_id" ON "cancellation_charges" ("worker_id");
CREATE INDEX IF NOT EXISTS "idx_cancellation_charges_status" ON "cancellation_charges" ("status");

-- Datos de transferencia del experto en su perfil
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_bank_name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_bank_account_type" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_bank_account_number" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_bank_rut" text;
