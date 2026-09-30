-- Update categories to new list
-- Handle FK constraints properly before deleting categories

-- Step 1: Clear worker_categories (no FK issue)
DELETE FROM worker_categories;

-- Step 2: Null out users.category_id (nullable column)
UPDATE users SET category_id = NULL WHERE category_id IS NOT NULL;

-- Step 3: services.category_id is NOT NULL — temporarily drop constraint,
--          null it out, delete old categories, insert new, then reassign
ALTER TABLE services ALTER COLUMN category_id DROP NOT NULL;
UPDATE services SET category_id = NULL WHERE category_id IS NOT NULL;

-- Step 4: Now safe to delete categories
DELETE FROM categories;

-- Step 5: Reset sequence
ALTER SEQUENCE categories_id_seq RESTART WITH 1;

-- Step 6: Insert new categories
INSERT INTO categories (name, description, icon, is_active) VALUES
  ('Mantenciones y Reparaciones', 'Arreglos generales en el hogar y mantenimiento preventivo', 'Wrench', true),
  ('Limpieza y Aseo', 'Servicios de limpieza residencial y comercial', 'Sparkles', true),
  ('Jardinería', 'Cuidado de jardines, plantas y áreas verdes', 'Leaf', true),
  ('Servicios Domésticos y Eventos', 'Apoyo en el hogar y organización de eventos', 'HardHat', true),
  ('Fletes y Mano de Obra', 'Transporte de muebles, mudanzas y trabajo físico', 'Truck', true),
  ('Salud, Bienestar y Cuidados', 'Cuidado de personas, salud en casa y bienestar', 'Pipette', true),
  ('Automotriz', 'Mecánica, lavado y servicios para vehículos', 'Flame', true),
  ('Cámara de Seguridad y Alarmas', 'Instalación y monitoreo de sistemas de seguridad', 'ShieldCheck', true),
  ('Personal para Mandados y Junior', 'Diligencias, compras y asistencia personal', 'Hammer', true),
  ('Cuidado y Estética Canina (Mascotas)', 'Grooming, paseos y cuidado de mascotas', 'Scissors', true);

-- Step 7: Assign all existing services to category 1 (Mantenciones y Reparaciones)
--          as a safe default — workers/admin can update afterward
UPDATE services SET category_id = 1;

-- Step 8: Restore NOT NULL constraint
ALTER TABLE services ALTER COLUMN category_id SET NOT NULL;
