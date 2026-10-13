# Migración de verificación telefónica a Twilio Verify

## Objetivo

Reemplazar Firebase Phone Auth para el envío y la validación de códigos SMS
telefónicos de Fixgo por Twilio Verify, manteniendo Firebase para notificaciones
push y otros servicios que no forman parte de este flujo.

La integración debe ejecutarse desde el backend de Fixgo y funcionar en Railway.
Las credenciales nunca deben llegar al navegador, al APK ni al repositorio.

## Decisiones

- Proveedor: Twilio Verify.
- Integración: llamadas REST desde el servidor usando `fetch` nativo de Node,
  sin depender del conector de Replit en producción.
- Canal: SMS.
- Formato: números chilenos normalizados a E.164 (`+569XXXXXXXX`).
- El código OTP lo genera y valida Twilio; Fixgo no lo guarda ni lo calcula.
- La unicidad de teléfonos verificados sigue siendo responsabilidad de Fixgo.
- Firebase Messaging y la configuración FCM no se eliminan.

## Variables de entorno

Railway debe definir estas variables como secretos:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Si falta cualquiera de ellas, el backend debe responder un error explícito de
configuración y no intentar enviar un SMS. No se debe usar un fallback silencioso.

## Flujo del servidor

### Solicitar código

Agregar `POST /api/auth/phone/start`, protegido por autenticación.

1. Validar y normalizar el teléfono.
2. Aplicar límite por usuario, IP y teléfono.
3. Enviar una solicitud `POST` con Basic Auth a:

   `https://verify.twilio.com/v2/Services/{serviceSid}/Verifications`

   usando `To`, `Channel=sms` y locale español.
4. Responder solo con un estado de envío aceptado; nunca devolver credenciales
   ni detalles internos de Twilio.

### Confirmar código

Mantener `POST /api/auth/phone/confirm` como endpoint de confirmación para
reducir el cambio de contrato. El cuerpo pasará a ser:

```json
{
  "phone": "+56912345678",
  "code": "123456"
}
```

1. Validar el teléfono y el código.
2. Consultar `VerificationCheck` de Twilio.
3. Aceptar únicamente el estado `approved`.
4. Comprobar que el teléfono no esté verificado por otro usuario.
5. Actualizar atómicamente `phone`, `phoneVerified` y `phoneVerifiedAt`.
6. Invalidar la caché del usuario y responder con el teléfono normalizado.

El rechazo por teléfono ya usado debe conservar el contrato `409` y el error
`PHONE_TAKEN`.

## Cliente web y móvil

Actualizar tanto `client/pages/verify-phone.tsx` como
`client/components/phone-verify-dialog.tsx`:

- El botón de envío llamará al backend en vez de `signInWithPhoneNumber`.
- La pantalla de código enviará `phone` y `code` al backend.
- Se eliminará el uso de `RecaptchaVerifier`, `ConfirmationResult` y
  `confirmVerificationCode` en estos flujos.
- La URL será relativa en web y usará `APP_URL` en la aplicación nativa, igual
  que las demás llamadas autenticadas del proyecto.
- Los errores visibles distinguirán configuración, cuota, límite de intentos,
  número inválido, código incorrecto/expirado y teléfono ya usado.
- Firebase Phone Auth podrá permanecer en el archivo compartido durante una
  transición, pero no debe ser invocado por ninguna pantalla de verificación.

## Seguridad y abuso

- Los secretos solo existen en las variables de entorno del servidor.
- No se guardan códigos OTP en la base de datos.
- El backend aplica límites de frecuencia y no permite reenviar sin respetar
  una ventana mínima.
- Las respuestas no revelan si un teléfono pertenece a otra cuenta antes de
  completar correctamente el flujo de verificación.
- Se mantiene la comprobación server-side de unicidad después de validar el
  código.
- Los errores de Twilio se registran con un código interno y contexto mínimo;
  nunca se registran tokens, códigos SMS ni credenciales.

## Compatibilidad y limpieza

- Firebase Admin seguirá disponible para las funciones que lo necesiten.
- Se retirará únicamente la dependencia de Firebase Phone Auth del flujo web y
  móvil.
- No se cambiará el esquema de usuarios porque ya existen
  `phoneVerified` y `phoneVerifiedAt`.
- Se documentará la configuración de Railway y las pruebas con números de
  Entel, Movistar, WOM y Claro.

## Validación

- Pruebas unitarias para normalización, errores de Twilio y estados de
  confirmación.
- Prueba de integración con credenciales de Twilio en un entorno no productivo.
- Verificar número nuevo: envío, código correcto, código incorrecto y código
  expirado.
- Verificar número ya asociado a otra cuenta: respuesta `PHONE_TAKEN` sin
  modificar la cuenta actual.
- Verificar límites de reenvío y ausencia de secretos en logs o bundles.
- Ejecutar TypeScript, build web y las regresiones existentes de autenticación.

## Criterio de finalización

Un usuario autenticado puede verificar un número chileno nuevo desde web y
Android/iOS usando Twilio Verify, el servidor actualiza la cuenta solo después
de una aprobación de Twilio y una segunda cuenta no puede reutilizar un teléfono
verificado. Firebase Phone Auth no participa en el flujo, y Firebase Messaging
continúa funcionando.