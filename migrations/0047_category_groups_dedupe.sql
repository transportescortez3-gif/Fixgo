-- 0047: Corrección de categoría duplicada "Retiro de Escombro(s) y Residuos"
--       + agrupación de especialidades por rubro (group_name).
-- Idempotente: puede ejecutarse varias veces sin efectos adversos.

-- 1) Fusionar categorías duplicadas (variantes singular/plural o distinta capitalización)
DO $$
DECLARE
  canon_id integer;
  dup RECORD;
  sub RECORD;
  twin_id integer;
BEGIN
  -- Canónica: la versión plural "Retiro de Escombros y Residuos" (la más antigua si hay varias)
  SELECT id INTO canon_id FROM categories
   WHERE lower(btrim(name)) = 'retiro de escombros y residuos'
   ORDER BY id LIMIT 1;

  IF canon_id IS NULL THEN
    -- Solo existe la variante singular: usarla como canónica y normalizar el nombre
    SELECT id INTO canon_id FROM categories
     WHERE lower(btrim(name)) = 'retiro de escombro y residuos'
     ORDER BY id LIMIT 1;
    IF canon_id IS NULL THEN
      RETURN; -- no hay ninguna variante, nada que hacer
    END IF;
    UPDATE categories SET name = 'Retiro de Escombros y Residuos' WHERE id = canon_id;
  END IF;

  FOR dup IN
    SELECT id FROM categories
     WHERE id <> canon_id
       AND lower(btrim(name)) IN ('retiro de escombro y residuos', 'retiro de escombros y residuos')
  LOOP
    -- Reapuntar referencias directas
    UPDATE users    SET category_id = canon_id WHERE category_id = dup.id;
    UPDATE services SET category_id = canon_id WHERE category_id = dup.id;

    -- worker_categories tiene UNIQUE(worker_id, category_id):
    -- mover solo si el experto no tiene ya la canónica; el resto se elimina.
    UPDATE worker_categories wc SET category_id = canon_id
     WHERE wc.category_id = dup.id
       AND NOT EXISTS (
         SELECT 1 FROM worker_categories w2
          WHERE w2.worker_id = wc.worker_id AND w2.category_id = canon_id
       );
    -- Si la fila duplicada que se va a eliminar era la principal del experto,
    -- traspasar la marca is_primary a su fila canónica antes de borrarla.
    UPDATE worker_categories wc SET is_primary = true
     WHERE wc.category_id = canon_id
       AND EXISTS (
         SELECT 1 FROM worker_categories w2
          WHERE w2.worker_id = wc.worker_id
            AND w2.category_id = dup.id
            AND w2.is_primary
       );
    DELETE FROM worker_categories WHERE category_id = dup.id;

    -- Subcategorías: mover a la canónica; si ya existe una gemela con el mismo
    -- nombre, reapuntar los servicios a la gemela y eliminar la duplicada.
    FOR sub IN SELECT id, name FROM subcategories WHERE category_id = dup.id LOOP
      SELECT id INTO twin_id FROM subcategories
       WHERE category_id = canon_id AND lower(btrim(name)) = lower(btrim(sub.name))
       LIMIT 1;
      IF twin_id IS NULL THEN
        UPDATE subcategories SET category_id = canon_id WHERE id = sub.id;
      ELSE
        UPDATE services SET subcategory_id = twin_id WHERE subcategory_id = sub.id;
        DELETE FROM subcategories WHERE id = sub.id;
      END IF;
    END LOOP;

    DELETE FROM categories WHERE id = dup.id;
  END LOOP;
END $$;

-- 2) Agrupación de especialidades por rubro
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_name text;

UPDATE categories SET group_name = 'Hogar y mantención' WHERE name IN (
  'Mantenciones y Reparaciones',
  'Limpieza y Aseo',
  'Jardinería',
  'Servicios Domésticos y Eventos',
  'Cámara de Seguridad y Alarmas'
);

UPDATE categories SET group_name = 'Transporte y logística'
 WHERE platform = 'fletes' OR name = 'Retiro de Escombros y Residuos';

UPDATE categories SET group_name = 'Personas y cuidados' WHERE name IN (
  'Salud, Bienestar y Cuidados',
  'Cuidado y Estética Canina (Mascotas)'
);

UPDATE categories SET group_name = 'Oficios y apoyo' WHERE name IN (
  'Mano de Obra',
  'Automotriz',
  'Personal para Mandados y Junior'
);

-- Cualquier categoría sin rubro asignado (futuras o creadas por admin)
UPDATE categories SET group_name = 'Otros servicios' WHERE group_name IS NULL;
