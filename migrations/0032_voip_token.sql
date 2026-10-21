-- Token de PushKit (VoIP) del dispositivo iOS del usuario. Es independiente del
-- fcm_token de Android: los push VoIP viajan por APNs directamente (no por FCM),
-- así que se guarda por separado para no mezclar transportes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS voip_token TEXT;
