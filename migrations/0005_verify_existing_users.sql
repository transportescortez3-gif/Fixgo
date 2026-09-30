-- Todos los usuarios registrados antes de la verificación por email se marcan como verificados
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE AND email_verify_token IS NULL;
