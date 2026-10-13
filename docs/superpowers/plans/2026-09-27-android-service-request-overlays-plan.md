# Plan de implementación: alertas Android de solicitudes

## Alcance

Implementar el diseño aprobado en
`docs/superpowers/specs/2026-09-27-android-service-request-overlays-design.md`.
Solo cambia la entrega Android de `service_request`; llamadas, `worker_arrived`,
iOS, web, ciclo de reservas y reglas de pagos quedan fuera.

## Pasos

1. **Extender el payload de solicitud con su vencimiento**
   - Propagar la fecha `expiresAt` de la sesión de alerta junto con el `deliveryId`
     hasta el payload de datos Android.
   - Mantener los mensajes Android de datos-only y los payloads visibles
     existentes para iOS/web.
   - Comprobar la forma del payload y no enviar avisos de solicitudes ya vencidas.

2. **Agregar pantalla nativa de solicitud**
   - Crear una Activity independiente de `IncomingCallActivity`.
   - Mostrar marca, trabajo, zona aproximada, contador de vigencia y las acciones
     `Ver solicitud` y `Cerrar`; nunca aceptar automáticamente.
   - `Ver solicitud` abre el deep link existente en `MainActivity`.
   - `Cerrar` oculta la Activity y conserva la notificación/reserva hasta vencer.
   - Si el permiso flotante falta, explicar una sola vez cómo activarlo; abrir
     Ajustes únicamente después de una acción explícita y continuar con la ruta
     normal si la persona cancela o deniega.

3. **Agregar presentación flotante opcional**
   - Declarar y comprobar el acceso especial `SYSTEM_ALERT_WINDOW`.
   - En pantalla encendida y otra app visible, mostrar una única ventana nativa
     cuando el permiso esté concedido.
   - Incorporar `Ver solicitud`, `Cerrar`, deduplicación por `deliveryId` y cierre
     al vencimiento.
   - Si no se puede crear la ventana, usar la notificación urgente existente.
   - Cuando la ventana sí aparece, conservar un acceso silencioso en bandeja
     mediante un canal de baja importancia nuevo y versionado.

4. **Conectar la ruta FCM según el dispositivo**
   - App en primer plano: dejar la alerta actual Socket.IO como única presentación.
   - Pantalla apagada/bloqueada: intentar `fullScreenIntent` hacia la Activity
     nativa y respetar los controles de Android.
   - Pantalla encendida: ventana flotante si está autorizada; notificación urgente
     de respaldo si no.
   - No usar `startActivity` desde el servicio FCM para eludir restricciones.

5. **Validar el ciclo de vida**
   - Cancelar Activity, ventana y notificación al vencer su `expiresAt`.
   - Ignorar mensajes caducados al recibirlos.
   - Al abrir el deep link, dejar que la app y el servidor revaliden el estado;
     solicitudes canceladas/asignadas/vencidas no deben reabrirse como vigentes.
   - Confirmar que una entrega repetida no duplica ni cierra otra entrega activa.

6. **Verificación**
   - Ejecutar TypeScript, pruebas enfocadas del flujo de alertas y build web.
   - Intentar la compilación Android si hay SDK configurado; si no, registrar la
     limitación del entorno y dejar verificación de dispositivo Android como
     paso pendiente.
   - Probar foreground/background, pantalla bloqueada/encendida, permiso
     concedido/denegado/revocado, vencimiento y deep link en Android.

## Criterio de término

El fallback urgente sigue funcionando en todos los estados sin permiso; con
permiso se ve una sola ventana flotante por alerta, y la reserva/cola existente
se conserva hasta las transiciones ya aprobadas.

## Verificación realizada

- `pnpm exec tsc --noEmit`, `pnpm run build` y `git diff --check` pasan.
- Se intentó `./gradlew :app:compileDebugJavaWithJavac`; no pudo empezar la
  compilación porque este entorno no tiene Android SDK configurado.
- Falta probar el comportamiento en un dispositivo Android, incluidos pantalla
  bloqueada, permiso de pantalla flotante y restricciones de pantalla completa.