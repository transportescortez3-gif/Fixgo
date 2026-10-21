-- 0057: Normalizar rutas históricas que se guardaron como URL completa.
UPDATE security_selfies
SET
  object_path = regexp_replace(object_path, '^.*/objects/', ''),
  original_object_path = regexp_replace(original_object_path, '^.*/objects/', '')
WHERE original_object_path LIKE '%/objects/%';