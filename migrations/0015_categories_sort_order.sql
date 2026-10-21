ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 99;

UPDATE categories SET sort_order = 1 WHERE name ILIKE '%mantenciones%' OR name ILIKE '%reparaciones%';
UPDATE categories SET sort_order = 2 WHERE name ILIKE '%limpieza%';
UPDATE categories SET sort_order = 3 WHERE name ILIKE '%fletes%';
UPDATE categories SET sort_order = 4 WHERE name ILIKE '%salud%' OR name ILIKE '%bienestar%';
UPDATE categories SET sort_order = 5 WHERE name ILIKE '%canina%' OR name ILIKE '%mascota%';
UPDATE categories SET sort_order = 6 WHERE name ILIKE '%jardiner%';
UPDATE categories SET sort_order = 7 WHERE name ILIKE '%doméstic%' OR name ILIKE '%eventos%';
UPDATE categories SET sort_order = 8 WHERE name ILIKE '%seguridad%' OR name ILIKE '%alarma%';
UPDATE categories SET sort_order = 9 WHERE name ILIKE '%automotriz%';
UPDATE categories SET sort_order = 10 WHERE name ILIKE '%mandados%' OR name ILIKE '%junior%';
