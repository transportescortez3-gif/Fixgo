-- Catálogo actualizado de planes Fixgo.
-- Esta migración también actualiza instalaciones existentes; el seed de 0023
-- solo cubre bases nuevas.
UPDATE subscription_plans SET
  name = 'Gratuito',
  price_clp = 0,
  features = '{
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
  }'::jsonb
WHERE code = 'pro_free';

UPDATE subscription_plans SET
  name = 'Pro Mensual',
  price_clp = 34990,
  features = '{
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
  }'::jsonb
WHERE code = 'pro_monthly';

UPDATE subscription_plans SET
  name = 'Pro Anual',
  price_clp = 349900,
  features = '{
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
  }'::jsonb
WHERE code = 'pro_annual';

UPDATE subscription_plans SET
  name = 'Pro+ Mensual',
  price_clp = 49990,
  features = '{
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
  }'::jsonb
WHERE code = 'pro_plus_monthly';

UPDATE subscription_plans SET
  name = 'Pro+ Anual',
  price_clp = 499900,
  features = '{
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
  }'::jsonb
WHERE code = 'pro_plus_annual';

-- El trial del cliente usa el plan premium equivalente de su rol.
UPDATE subscription_plans SET features = features || '{
  "voice_calls": true,
  "image_attachments": true
}'::jsonb
WHERE code IN ('client_premium_monthly', 'client_premium_annual');