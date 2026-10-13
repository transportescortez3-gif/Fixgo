# Diseño: tarjetas de confirmación de trabajos en Inicio

## Objetivo

Hacer que la tarjeta de aviso de finalización funcione de forma simétrica para
clientes y expertos. Cada tarjeta pertenece al usuario que debe confirmar: al
confirmar, desaparece inmediatamente para ese usuario, sin ocultar ni marcar
como leída la tarjeta de la otra persona.

## Reglas de comportamiento

1. Una tarjeta `work_done_confirm` permanece visible en Inicio mientras siga
   pendiente para su destinatario.
2. La confirmación del cliente elimina inmediatamente la tarjeta del cliente.
3. La confirmación del experto elimina inmediatamente la tarjeta del experto.
4. La confirmación de un usuario no modifica las notificaciones del otro
   usuario.
5. Si no existe una confirmación dentro de 24 horas, el motor completa
   automáticamente el servicio. La tarjeta pendiente deja de ser accionable y
   no debe quedar visible como una confirmación pendiente.
6. Las reglas son idénticas independientemente de quién marcó primero el
   trabajo como realizado.

## Diseño técnico

Los endpoints existentes de confirmación (`/services/:id/complete` para el
cliente y `/services/:id/worker-complete` para el experto) harán una limpieza
server-side de las notificaciones `work_done_confirm` del usuario autenticado
relacionadas con ese servicio cuando la solicitud represente una confirmación
válida.

La limpieza será condicional al `userId` y al `relatedId` del servicio. Después
se emitirá `notifications_updated` únicamente al usuario que confirmó, para
que `HomeAlerts` actualice todas sus sesiones abiertas de inmediato. No se
alterará la notificación del contraparte.

Los caminos idempotentes, en los que el servicio ya fue confirmado por ese
usuario o ya está completado, también deben dejar la notificación propia
resuelta si todavía existiera. Las respuestas y los side effects existentes
de finalización se conservan.

## Flujo de datos

- Inicio consulta las notificaciones no leídas del usuario.
- El endpoint de confirmación actualiza el estado de la confirmación y marca
  como leídas las notificaciones de confirmación propias.
- El servidor emite `notifications_updated` al usuario confirmante.
- `HomeAlerts` recarga y elimina la tarjeta de ese usuario.
- La otra sesión conserva su propia notificación y tarjeta hasta que confirme
  o el motor complete automáticamente después de 24 horas.

## Manejo de errores y concurrencia

- La actualización de notificaciones debe estar limitada al usuario
  autenticado, al servicio y al tipo `work_done_confirm`.
- Una confirmación repetida debe seguir siendo idempotente y no producir
  notificaciones ni mensajes duplicados.
- Si la limpieza de la notificación falla, el endpoint debe tratarlo como un
  error de la operación, evitando afirmar al cliente que la confirmación quedó
  totalmente resuelta.
- El autocompletado de 24 horas mantiene su actualización condicional por
  estado y sus side effects actuales.

## Verificación

Agregar pruebas para:

- experto marca primero y cliente confirma: desaparece solo la tarjeta del
  cliente;
- cliente marca primero y experto confirma: desaparece solo la tarjeta del
  experto;
- una confirmación repetida no duplica efectos y deja resuelta la tarjeta
  propia;
- una notificación de confirmación del contraparte permanece intacta;
- el autocompletado de 24 horas no deja una confirmación pendiente visible.
