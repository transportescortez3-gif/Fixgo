-- Resolución admin de cargos de visita técnica en disputa.
-- Nuevos campos: nota interna del admin y quién resolvió.
-- Nuevo estado posible en "status": 'voided' (cargo anulado por soporte).
ALTER TABLE "cancellation_charges" ADD COLUMN IF NOT EXISTS "admin_note" text;
ALTER TABLE "cancellation_charges" ADD COLUMN IF NOT EXISTS "resolved_by_admin_id" integer REFERENCES "users"("id");
