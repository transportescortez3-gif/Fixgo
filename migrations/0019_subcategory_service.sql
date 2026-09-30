ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "subcategory_id" integer REFERENCES "subcategories"("id");
