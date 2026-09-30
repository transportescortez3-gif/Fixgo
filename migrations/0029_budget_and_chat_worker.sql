ALTER TABLE "messages" ADD COLUMN "worker_id" integer REFERENCES "users"("id");
CREATE INDEX "idx_messages_worker_id" ON "messages" ("worker_id");

ALTER TABLE "services" ADD COLUMN "budget_note" text;
