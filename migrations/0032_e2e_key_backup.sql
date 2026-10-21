-- Sincronizar llave E2E entre dispositivos: respaldo cifrado de la llave privada.
-- Se guarda la llave privada CIFRADA (envuelta con una clave derivada de la
-- contraseña del usuario), junto con la sal del KDF, el IV y las iteraciones.
ALTER TABLE user_crypto_keys ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;
ALTER TABLE user_crypto_keys ADD COLUMN IF NOT EXISTS kdf_salt TEXT;
ALTER TABLE user_crypto_keys ADD COLUMN IF NOT EXISTS kdf_iv TEXT;
ALTER TABLE user_crypto_keys ADD COLUMN IF NOT EXISTS kdf_iterations INTEGER;
