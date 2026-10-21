-- El plan Pro no incluye estadísticas; esa función queda reservada para Pro+.
UPDATE subscription_plans
SET features = jsonb_set(features, '{stats}', 'false'::jsonb)
WHERE code IN ('pro_monthly', 'pro_annual');