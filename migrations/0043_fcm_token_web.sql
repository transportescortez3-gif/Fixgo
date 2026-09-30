-- Token FCM separado para navegador/web push, independiente del token nativo
-- (Capacitor Android/iOS). Permite recibir avisos push aunque el usuario use
-- la app desde el navegador del celular en vez de la app compilada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token_web TEXT;
