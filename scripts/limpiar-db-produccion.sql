-- ================================================================
-- FIXGO — LIMPIEZA DE BASE DE DATOS DE PRODUCCIÓN
-- ================================================================
-- QUÉ SE CONSERVA:
--   ✅ categories          → categorías de servicios
--   ✅ subcategories        → especializaciones por categoría
--   ✅ subscription_plans   → planes de suscripción definidos
--   ✅ coupons              → cupones de descuento definidos
--   ✅ commission_config    → configuración de comisión
--   ✅ site_settings        → configuración del sitio
--   ✅ signatures           → firmas de la empresa
--   ✅ users (role='admin') → cuentas administrador
--
-- QUÉ SE ELIMINA:
--   ❌ Todos los usuarios clientes y trabajadores
--   ❌ Servicios / trabajos
--   ❌ Propuestas
--   ❌ Mensajes
--   ❌ Pagos y cobros
--   ❌ Reseñas
--   ❌ Notificaciones
--   ❌ Documentos KYC
--   ❌ Portafolios y certificaciones
--   ❌ Suscripciones de usuarios
--   ❌ Tickets de soporte
--   ❌ Balances y transacciones
--   ❌ Claves de cifrado
-- ================================================================
-- ⚠️  ADVERTENCIA: Esta operación es IRREVERSIBLE.
--     Ejecutar solo con backup previo de producción.
-- ================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- PASO 1: Vaciar todas las tablas transaccionales
--         (CASCADE maneja el orden de FK automáticamente)
-- ─────────────────────────────────────────────────────────────────
TRUNCATE TABLE
  ticket_responses,
  support_tickets,
  notifications,
  balance_transactions,
  payouts,
  reviews,
  coupon_uses,
  subscription_payments,
  user_subscriptions,
  messages,
  proposals,
  payments,
  services,
  kyc_documents,
  portfolio_images,
  certifications,
  worker_categories,
  user_crypto_keys
RESTART IDENTITY CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- PASO 2: Eliminar todos los usuarios excepto administradores
-- ─────────────────────────────────────────────────────────────────
DELETE FROM users WHERE role != 'admin';

-- ─────────────────────────────────────────────────────────────────
-- PASO 3: Limpiar campos de usuario en cuentas admin
--         (ratings, balance, tokens de sesión, etc.)
-- ─────────────────────────────────────────────────────────────────
UPDATE users SET
  rating                = NULL,
  total_reviews         = 0,
  client_rating         = NULL,
  client_total_reviews  = 0,
  balance               = 0,
  balance_gifted        = FALSE,
  fcm_token             = NULL,
  reset_token           = NULL,
  reset_token_expires   = NULL
WHERE role = 'admin';

-- ─────────────────────────────────────────────────────────────────
-- PASO 4: Verificación — muestra qué quedó en la base de datos
-- ─────────────────────────────────────────────────────────────────
SELECT 'users (admin)' AS tabla,         COUNT(*) AS registros FROM users
UNION ALL
SELECT 'categories',                     COUNT(*) FROM categories
UNION ALL
SELECT 'subcategories',                  COUNT(*) FROM subcategories
UNION ALL
SELECT 'subscription_plans',             COUNT(*) FROM subscription_plans
UNION ALL
SELECT 'coupons',                        COUNT(*) FROM coupons
UNION ALL
SELECT 'commission_config',              COUNT(*) FROM commission_config
UNION ALL
SELECT 'site_settings',                  COUNT(*) FROM site_settings
UNION ALL
SELECT '--- DEBE SER 0 ---',             0
UNION ALL
SELECT 'services',                       COUNT(*) FROM services
UNION ALL
SELECT 'proposals',                      COUNT(*) FROM proposals
UNION ALL
SELECT 'messages',                       COUNT(*) FROM messages
UNION ALL
SELECT 'payments',                       COUNT(*) FROM payments
UNION ALL
SELECT 'reviews',                        COUNT(*) FROM reviews
UNION ALL
SELECT 'notifications',                  COUNT(*) FROM notifications
UNION ALL
SELECT 'kyc_documents',                  COUNT(*) FROM kyc_documents
UNION ALL
SELECT 'user_subscriptions',             COUNT(*) FROM user_subscriptions
UNION ALL
SELECT 'subscription_payments',          COUNT(*) FROM subscription_payments
UNION ALL
SELECT 'balance_transactions',           COUNT(*) FROM balance_transactions
UNION ALL
SELECT 'support_tickets',                COUNT(*) FROM support_tickets
UNION ALL
SELECT 'worker_categories',              COUNT(*) FROM worker_categories
ORDER BY tabla;

COMMIT;
