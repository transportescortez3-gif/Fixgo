-- =============================================================
-- 0023_subscriptions.sql
-- Sistema de suscripciones SaaS (Webpay Plus, renovación manual)
-- =============================================================

-- Tipos enumerados
CREATE TYPE plan_interval AS ENUM ('monthly', 'annual');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE coupon_discount_type AS ENUM ('percent', 'fixed');

-- Planes de suscripción (datos maestros, se seed a continuación)
CREATE TABLE subscription_plans (
  id           SERIAL PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('client','worker')),
  interval     plan_interval NOT NULL,
  price_clp    INTEGER NOT NULL,
  features     JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suscripciones de usuarios
CREATE TABLE user_subscriptions (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code           TEXT NOT NULL,
  status              subscription_status NOT NULL DEFAULT 'active',
  interval            plan_interval NOT NULL,
  price_paid_clp      INTEGER NOT NULL DEFAULT 0,
  coupon_code         TEXT,
  discount_clp        INTEGER NOT NULL DEFAULT 0,
  trial_ends_at       TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end  TIMESTAMPTZ NOT NULL,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);

-- Pagos de suscripciones
CREATE TABLE subscription_payments (
  id                  SERIAL PRIMARY KEY,
  subscription_id     INTEGER NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_clp          INTEGER NOT NULL,
  tbk_token           TEXT,
  tbk_buy_order       TEXT,
  tbk_session_id      TEXT,
  tbk_auth_code       TEXT,
  tbk_card_number     TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_payments_user_id ON subscription_payments(user_id);
CREATE INDEX idx_subscription_payments_tbk_token ON subscription_payments(tbk_token);

-- Cupones de descuento
CREATE TABLE coupons (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  discount_type   coupon_discount_type NOT NULL,
  discount_value  INTEGER NOT NULL,
  max_uses        INTEGER,
  used_count      INTEGER NOT NULL DEFAULT 0,
  valid_plans     TEXT[],
  valid_intervals TEXT[],
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de uso de cupones (un uso por usuario)
CREATE TABLE coupon_uses (
  id          SERIAL PRIMARY KEY,
  coupon_id   INTEGER NOT NULL REFERENCES coupons(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, user_id)
);

-- =====================
-- SEED: planes iniciales
-- =====================
INSERT INTO subscription_plans (code, name, role, interval, price_clp, features, sort_order) VALUES

-- CLIENTES
('client_free', 'Gratuito', 'client', 'monthly', 0, '{
  "posts_per_month": 3,
  "messages_per_post": 3,
  "map_radius_km": 5,
  "presale_chat": false,
  "full_reviews": false,
  "ads": true,
  "fixxer_guarantee": false,
  "human_support": false
}', 1),

('client_premium_monthly', 'Premium Mensual', 'client', 'monthly', 3990, '{
  "posts_per_month": -1,
  "messages_per_post": -1,
  "map_radius_km": -1,
  "presale_chat": true,
  "full_reviews": true,
  "ads": false,
  "fixxer_guarantee": true,
  "human_support": true
}', 2),

('client_premium_annual', 'Premium Anual', 'client', 'annual', 39900, '{
  "posts_per_month": -1,
  "messages_per_post": -1,
  "map_radius_km": -1,
  "presale_chat": true,
  "full_reviews": true,
  "ads": false,
  "fixxer_guarantee": true,
  "human_support": true
}', 3),

-- TRABAJADORES
('pro_free', 'Gratuito', 'worker', 'monthly', 0, '{
  "radius_km": 5,
  "leads_per_month": 5,
  "messages_per_month": -1,
  "categories": 1,
  "verified_badge": false,
  "priority_position": false,
  "stats": false,
  "chat_text_free": true,
  "voice_calls": false,
  "image_attachments": false,
  "support_level": "standard"
}', 4),

('pro_monthly', 'Pro Mensual', 'worker', 'monthly', 14990, '{
  "radius_km": -1,
  "leads_per_month": -1,
  "messages_per_month": -1,
  "categories": 3,
  "verified_badge": true,
  "priority_position": false,
  "stats": false,
  "chat_text_free": true,
  "voice_calls": true,
  "image_attachments": true,
  "support_level": "direct"
}', 5),

('pro_annual', 'Pro Anual', 'worker', 'annual', 149900, '{
  "radius_km": -1,
  "leads_per_month": -1,
  "messages_per_month": -1,
  "categories": 3,
  "verified_badge": true,
  "priority_position": false,
  "stats": false,
  "chat_text_free": true,
  "voice_calls": true,
  "image_attachments": true,
  "support_level": "direct"
}', 6),

('pro_plus_monthly', 'Pro+ Mensual', 'worker', 'monthly', 49990, '{
  "radius_km": -1,
  "leads_per_month": -1,
  "messages_per_month": -1,
  "categories": -1,
  "verified_badge": true,
  "priority_position": true,
  "top_position": true,
  "map_featured": true,
  "early_leads_min": 5,
  "stats": "advanced",
  "video_presentation": true,
  "top_pro_badge": true,
  "voice_calls": true,
  "image_attachments": true,
  "budget_visibility": true,
  "support_level": "preferential"
}', 7),

('pro_plus_annual', 'Pro+ Anual', 'worker', 'annual', 499900, '{
  "radius_km": -1,
  "leads_per_month": -1,
  "messages_per_month": -1,
  "categories": -1,
  "verified_badge": true,
  "priority_position": true,
  "top_position": true,
  "map_featured": true,
  "early_leads_min": 5,
  "stats": "advanced",
  "video_presentation": true,
  "top_pro_badge": true,
  "voice_calls": true,
  "image_attachments": true,
  "budget_visibility": true,
  "support_level": "preferential"
}', 8);
