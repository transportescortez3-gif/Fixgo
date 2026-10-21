-- 0048: Nota suavizada estilo inDriver + motivo de cancelación.
-- Idempotente: puede ejecutarse varias veces sin efectos adversos.

-- 1) Motivo de cancelación declarado por quien cancela (visible para admin)
ALTER TABLE services ADD COLUMN IF NOT EXISTS cancelled_by integer REFERENCES users(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 2) Recalcular la nota de TODOS los usuarios con la fórmula nueva:
--    promedio bayesiano sobre las últimas 75 reseñas reales con un "prior" de
--    10 reseñas perfectas (5★). Las filas con rating = 0 son placeholders
--    (creadas cuando el experto calificó primero al cliente) y NO cuentan.
--    Debe calzar EXACTAMENTE con smoothedRating() en server/routes/reviews.ts.

-- 2a) Nota del experto (users.rating / users.total_reviews)
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

-- 2b) Expertos cuyo contador quedó inflado por placeholders (tienen filas de
--     reseña pero ninguna real): resetear nota y contador.
UPDATE users u
   SET rating = NULL, total_reviews = 0
 WHERE u.total_reviews > 0
   AND EXISTS (SELECT 1 FROM reviews r WHERE r.worker_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.worker_id = u.id AND r.rating >= 1);

-- 2c) Nota del cliente (users.client_rating / users.client_total_reviews)
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
