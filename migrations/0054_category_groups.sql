-- 0054: Rubros administrables para categorías.
-- Mantiene group_name durante la transición para compatibilidad con clientes antiguos.

CREATE TABLE IF NOT EXISTS category_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'layers',
  color TEXT NOT NULL DEFAULT '#5b7fff',
  sort_order INTEGER NOT NULL DEFAULT 99,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_category_groups_name ON category_groups (name);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES category_groups(id) ON DELETE SET NULL;

INSERT INTO category_groups (name, icon, color, sort_order)
VALUES
  ('Hogar y Mantención', 'wrench', '#5b7fff', 1),
  ('Transporte y Logística', 'truck', '#38bdf8', 2),
  ('Personas y Cuidados', 'heart', '#fb7185', 3),
  ('Oficios y Apoyo', 'hammer', '#f59e0b', 4),
  ('Otros Servicios', 'layers', '#60a5fa', 5)
ON CONFLICT (name) DO NOTHING;

UPDATE categories
SET group_id = groups.id
FROM category_groups groups
WHERE categories.group_id IS NULL
  AND lower(trim(categories.group_name)) = lower(groups.name);

UPDATE categories
SET group_id = groups.id
FROM category_groups groups
WHERE categories.group_id IS NULL
  AND (
    lower(categories.name) IN (
      'mantenciones y reparaciones', 'limpieza y aseo', 'jardinería',
      'servicios domésticos y eventos', 'cámara de seguridad y alarmas'
    ) AND groups.name = 'Hogar y Mantención'
    OR lower(categories.name) IN (
      'fletes express', 'delivery y fletes menores', 'transportes de carga y mudanzas',
      'retiro de escombro y residuos', 'retiro de escombros y residuos', 'bodega y logística'
    ) AND groups.name = 'Transporte y Logística'
    OR lower(categories.name) IN (
      'salud, bienestar y cuidados', 'cuidado y estética canina (mascotas)'
    ) AND groups.name = 'Personas y Cuidados'
    OR lower(categories.name) IN (
      'mano de obra', 'personal para mandados y junior'
    ) AND groups.name = 'Oficios y Apoyo'
    OR lower(categories.name) IN ('mecánica automotriz', 'automotriz')
      AND groups.name = 'Otros Servicios'
  );

UPDATE categories
SET group_id = groups.id
FROM category_groups groups
WHERE categories.group_id IS NULL
  AND groups.name = 'Otros Servicios';

UPDATE categories
SET group_name = groups.name
FROM category_groups groups
WHERE categories.group_id = groups.id;