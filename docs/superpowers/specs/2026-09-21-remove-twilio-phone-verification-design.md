# Retiro de la verificación telefónica por SMS

## Objetivo

Eliminar Twilio Verify y cualquier obligación de verificar el número de teléfono. Los usuarios podrán registrarse, iniciar sesión y navegar sin pasar por una pantalla de verificación SMS.

El campo histórico `phoneVerified` se conserva en la base de datos para no romper datos existentes ni consultas administrativas, pero deja de controlar el acceso o la navegación del cliente.

## Alcance

### Backend

- Eliminar las rutas autenticadas `/api/auth/phone/send` y `/api/auth/phone/confirm`.
- Eliminar el módulo `server/lib/twilio-verify.ts`.
- Retirar las importaciones y referencias a Twilio desde las rutas de autenticación.
- Mantener la columna histórica `phoneVerified` y la acción administrativa de verificación manual, sin usarla como requisito del cliente.
- No modificar Firebase Messaging ni sus rutas de notificaciones push.

### Cliente

- Eliminar el cliente `client/lib/phone-verification.ts`.
- Eliminar la pantalla `/verify-phone` y su carga lazy.
- Eliminar la redirección global que bloquea a usuarios con `phoneVerified === false`.
- Eliminar cualquier dependencia visual o de flujo del código SMS.
- Mantener el perfil y el teléfono registrado sin iniciar un proceso de verificación.

### Configuración

- El código dejará de leer `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_API_KEY_SID` y `TWILIO_API_KEY`.
- Los secretos del workspace no se borrarán automáticamente durante esta implementación; quedarán sin uso hasta que el usuario los retire explícitamente.

## Flujo resultante

1. El usuario se registra con o sin teléfono, según las reglas actuales del formulario.
2. El backend crea la cuenta sin enviar SMS.
3. Después del login, `phoneVerified` no genera redirecciones ni bloqueos.
4. La ruta `/verify-phone` deja de existir.
5. Firebase continúa disponible únicamente para push notifications.

## Compatibilidad y riesgos

- No se elimina la columna `phoneVerified` para evitar una migración destructiva y preservar el historial administrativo.
- No se eliminan las vistas administrativas que muestran o marcan el estado histórico, porque no solicitan SMS al cliente.
- Cualquier enlace antiguo a `/verify-phone` dejará de ser válido; el router deberá permitir que la aplicación continúe con su flujo normal.

## Validación

- TypeScript sin errores.
- Build de producción correcto.
- Workflow arranca sin referencias a Twilio.
- Búsqueda final sin rutas o imports de Twilio/phone-verification en el cliente ni backend.
- Confirmar que `phoneVerified === false` ya no redirige a ningún usuario.
- Confirmar que Firebase Messaging continúa compilando y funcionando como antes.