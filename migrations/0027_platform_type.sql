-- Add platform_type to users (expertos | fletes), default expertos
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_type TEXT NOT NULL DEFAULT 'expertos';

-- Add platform column to categories to identify which sub-platform they belong to
ALTER TABLE categories ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'expertos';

-- Rename category 5: "Fletes y Mano de Obra" → "Mano de Obra"
UPDATE categories
SET name = 'Mano de Obra',
    description = 'Trabajo físico, jornaleros y ayudantes generales'
WHERE id = 5;

-- Remove flete-specific subcategories from category 5 (Mano de Obra)
DELETE FROM subcategories
WHERE category_id = 5
  AND name IN ('Servicios de Fletes', 'Transporte de Carga en General');

-- Reorder remaining subcategories of category 5
UPDATE subcategories SET sort_order = 1 WHERE category_id = 5 AND name = 'Ayudante para Carga y Descarga';
UPDATE subcategories SET sort_order = 2 WHERE category_id = 5 AND name = 'Armado de Muebles';
UPDATE subcategories SET sort_order = 3 WHERE category_id = 5 AND name = 'Personal para Bodega y Logística';
UPDATE subcategories SET sort_order = 4 WHERE category_id = 5 AND name = 'Retiro de Escombros';
UPDATE subcategories SET sort_order = 5 WHERE category_id = 5 AND name = 'Mano de Obra en General (Jornalero)';

-- Insert FIXXER Fletes categories
INSERT INTO categories (name, description, icon, sort_order, is_active, platform) VALUES
  ('Mudanzas Residenciales y Comerciales', 'Servicio completo de mudanzas para casas, departamentos y oficinas', 'Truck', 1, true, 'fletes'),
  ('Fletes y Transporte de Carga', 'Transporte de mercancías, materiales y objetos de todo tipo', 'Truck', 2, true, 'fletes'),
  ('Transporte Intercomunal y Regional', 'Fletes entre comunas y regiones de Chile', 'Truck', 3, true, 'fletes'),
  ('Ayudantes para Carga y Descarga', 'Personal para apoyar carga, descarga y traslado de objetos pesados', 'HardHat', 4, true, 'fletes'),
  ('Bodega y Logística', 'Servicios de almacenamiento, picking, packing y distribución', 'HardHat', 5, true, 'fletes'),
  ('Retiro de Escombros y Residuos', 'Retiro y transporte de escombros, muebles viejos y residuos', 'Hammer', 6, true, 'fletes');
