-- 0049: unicidad de reseña por (service_id, client_id) + dedupe previo.
-- Evita la condición de carrera de POST /reviews (select-then-write) y habilita
-- los upserts atómicos ON CONFLICT en server/routes/reviews.ts.
-- Idempotente: puede ejecutarse varias veces sin efectos adversos.

-- 1) Fusionar duplicados si existieran: conservar la fila "mejor" (reseña real
--    del cliente primero, luego la que tenga calificación del experto, luego
--    id menor) y traerle los mejores valores de las demás.
WITH agg AS (
  SELECT service_id, client_id,
         MAX(rating) AS best_rating,
         MAX(worker_rating) AS best_worker_rating,
         MAX(worker_comment) AS best_worker_comment,
         BOOL_OR(COALESCE(reviewed_by_worker, false)) AS any_rbw
    FROM reviews
   GROUP BY service_id, client_id
  HAVING COUNT(*) > 1
),
keepers AS (
  SELECT DISTINCT ON (r.service_id, r.client_id) r.id, r.service_id, r.client_id
    FROM reviews r
    JOIN agg a USING (service_id, client_id)
   ORDER BY r.service_id, r.client_id, (r.rating >= 1) DESC, (r.worker_rating IS NOT NULL) DESC, r.id
)
UPDATE reviews r
   SET rating = a.best_rating,
       worker_rating = COALESCE(r.worker_rating, a.best_worker_rating),
       worker_comment = COALESCE(r.worker_comment, a.best_worker_comment),
       reviewed_by_worker = (COALESCE(r.reviewed_by_worker, false) OR a.any_rbw)
  FROM keepers k
  JOIN agg a ON a.service_id = k.service_id AND a.client_id = k.client_id
 WHERE r.id = k.id;

-- 2) Eliminar las filas no conservadas (mismo criterio de orden que keepers;
--    tras la fusión, la fila conservada sigue rankeando primera).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY service_id, client_id
           ORDER BY (rating >= 1) DESC, (worker_rating IS NOT NULL) DESC, id
         ) AS rn
    FROM reviews
)
DELETE FROM reviews
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Índice único que hace imposible el duplicado a nivel de base
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_service_client ON reviews (service_id, client_id);

-- 4) Recalcular notas por si la fusión cambió filas (misma fórmula que 0048;
--    debe calzar EXACTAMENTE con smoothedRating() en server/routes/reviews.ts)
WITH ranked AS (
  SELECT worker_id, rating,
         ROW_NUMBER() OVER (PARTITION BY worker_id ORDER BY created_at DESC, id DESC) AS rn
    FROM reviews
   WHERE rating >= 1
), agg AS (
  SELECT worker_id,
         COUNT(*) AS total_count,
         SUM(rating) FILTER (WHERE rn <= 75) AS recent_sum,
         COUNT(*)    FILTER (WHERE rn <= 75) AS recent_count
    FROM ranked
   GROUP BY worker_id
)
UPDATE users u
   SET rating = ROUND(((10 * 5 + COALESCE(a.recent_sum, 0))::numeric / (10 + a.recent_count)), 2),
       total_reviews = a.total_count
  FROM agg a
 WHERE u.id = a.worker_id;

UPDATE users u
   SET rating = NULL, total_reviews = 0
 WHERE u.total_reviews > 0
   AND EXISTS (SELECT 1 FROM reviews r WHERE r.worker_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.worker_id = u.id AND r.rating >= 1);

WITH ranked AS (
  SELECT client_id, worker_rating,
         ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at DESC, id DESC) AS rn
    FROM reviews
   WHERE worker_rating IS NOT NULL AND worker_rating >= 1
), agg AS (
  SELECT client_id,
         COUNT(*) AS total_count,
         SUM(worker_rating) FILTER (WHERE rn <= 75) AS recent_sum,
         COUNT(*)           FILTER (WHERE rn <= 75) AS recent_count
    FROM ranked
   GROUP BY client_id
)
UPDATE users u
   SET client_rating = ROUND(((10 * 5 + COALESCE(a.recent_sum, 0))::numeric / (10 + a.recent_count)), 2),
       client_total_reviews = a.total_count
  FROM agg a
 WHERE u.id = a.client_id;
