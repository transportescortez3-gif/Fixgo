# Aviso de vencimiento de cancelación gratuita — Diseño

## Objetivo

Cuando finalice la ventana de cancelación gratuita de 10 minutos de un servicio
asignado, informar al cliente y al experto. El aviso debe quedar guardado en
Alertas y debe aparecer en tiempo real cuando cualquiera de los dos usuarios
esté conectado.

## Alcance

- Aplicar a servicios con `freeCancelUntil` vencido, cliente y experto
  asignados, y estado todavía activo.
- No crear el aviso si el servicio fue cancelado o completado antes del
  vencimiento.
- Emitir una sola notificación por usuario y por servicio, incluso después de
  reinicios del servidor o ejecuciones concurrentes del motor.
- Mantener intactas las reglas existentes de cobro, transferencia directa,
  selfies y ocultamiento/revelación de dirección.

## Arquitectura y flujo

1. Agregar a `services` una marca nullable
   `free_cancel_expiry_notified_at`.
2. Agregar el tipo de notificación `free_cancel_expired` al enum de
   notificaciones.
3. Extender el bucle del motor que corre cada 30 segundos para buscar servicios
   activos cuyo `freeCancelUntil` ya venció y cuya marca todavía sea nula.
4. Reclamar cada servicio mediante un `UPDATE` condicional que establezca la
   marca. Solo el proceso que recibe una fila actualizada podrá crear avisos.
5. Crear dos notificaciones persistentes con `createNotifications`: una para el
   cliente y otra para el experto. La función existente se encargará de emitir
   `new_notification` por socket y enviar push cuando haya token.
6. En el cliente, reconocer el nuevo tipo en la lista de Alertas y mostrar un
   toast inmediato con un texto específico cuando llegue el evento socket.
7. Hacer que la notificación navegue al servicio relacionado, igual que los
   avisos activos existentes.

## Mensaje

- Título: `Terminó el tiempo de cancelación gratuita`
- Mensaje: `Ya pasaron los 10 minutos de cancelación gratuita del servicio "${title}".`
- El mismo texto se muestra a ambos roles; no contiene datos bancarios ni
  afirma que se haya generado un cobro.

## Condiciones de seguridad e idempotencia

- La consulta solo considera servicios con estado `accepted` o `in_progress`,
  `freeCancelUntil` vencido, `workerId` no nulo y
  `freeCancelExpiryNotifiedAt` nulo.
- La marca se escribe con una condición que repite esos criterios.
- La notificación ocurre después de reclamar el servicio. Un fallo posterior
  queda registrado en logs y no puede generar duplicados en el siguiente ciclo.
- La expiración no crea cargos, no procesa pagos y no modifica la asignación.

## Cambios de datos

- La migración será idempotente con `ADD COLUMN IF NOT EXISTS`.
- El esquema Drizzle reflejará la nueva columna y el nuevo valor del enum.
- Los servicios existentes con una ventana ya vencida se notificarán una sola
  vez en el siguiente ciclo del motor si siguen activos.

## Frontend

- `notifications.tsx`: incluir `free_cancel_expired` como notificación activa,
  con icono de reloj/alerta y navegación al servicio.
- `layout.tsx`: al recibir `new_notification` de este tipo, invalidar las
  consultas de notificaciones y mostrar el toast inmediato.
- `home-alerts.tsx`: incluir el tipo para que el aviso no leído también pueda
  aparecer en Home y descartarse como los demás avisos persistentes.

## Verificación

- TypeScript y build de producción.
- Migraciones aplicadas sin error y de forma idempotente.
- Prueba del helper/consulta: un servicio elegible se reclama una sola vez;
  uno cancelado, completado o sin worker no se reclama.
- Verificar que se crean dos filas, una por cada usuario.
- Verificar que el evento socket se emite a ambos y que la UI invalida Alertas
  y muestra el aviso inmediato.