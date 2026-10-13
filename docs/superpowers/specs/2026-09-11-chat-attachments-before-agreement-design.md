# Adjuntos antes del acuerdo — Diseño

**Fecha:** 2026-09-11  
**Estado:** Aprobado por el usuario para implementación

## Objetivo

Permitir que el cliente y el trabajador envíen fotos y otros adjuntos desde
que existe su conversación, incluso antes de que el cliente confirme el
acuerdo y antes de que termine la ventana de cancelación gratuita de 10
minutos.

El cambio no debe habilitar llamadas, alterar el cifrado E2E ni permitir
mensajes o archivos en servicios cerrados.

## Alcance aprobado

- Se habilitan adjuntos para ambos participantes del hilo.
- Se conserva el gate del plan: `image_attachments` sigue siendo obligatorio.
  El plan Gratis continúa sin imágenes; Pro, Pro+ y sus trials pueden usar
  adjuntos.
- Se mantienen los límites actuales de cantidad, tamaño y tipos de archivo.
- Se conservan las copias E2E y de soporte, así como sus reglas de retención.
- No se cambia la ventana de cancelación gratuita ni el inicio del trabajo.

## Diseño técnico

### Autorización del servidor

Las rutas de inicialización, subida y completado dejarán de exigir
`workerId`, `freeCancelUntil` vencido y estado `accepted/in_progress`.
Seguirán exigiendo:

1. sesión autenticada;
2. servicio existente y no cerrado;
3. usuario autorizado para ese hilo;
4. plan con `image_attachments`;
5. validación de metadatos, límites y carga completa.

Para servicios pendientes, la autorización respetará el aislamiento existente
por `workerId`:

- el trabajador usa su propio `userId` como hilo;
- el cliente debe enviar el `workerId` de la conversación abierta;
- el servidor verificará que ese trabajador tenga una propuesta o hilo válido
  para el servicio;
- el adjunto conservará el `workerId` del hilo para evitar que un archivo de
  una conversación pendiente aparezca en otra.

Cuando el servicio ya tenga trabajador asignado, se usará el `service.workerId`
como hilo, igual que en los mensajes existentes.

### Asociación al mensaje

El endpoint de mensajes aceptará los adjuntos preparados tanto en estados
pendientes como en estados aceptados. La asociación seguirá comprobando que
los adjuntos:

- pertenecen al servicio y al hilo correctos;
- fueron subidos por el usuario autenticado;
- están listos y todavía no pertenecen a otro mensaje;
- cumplen el máximo acumulado de 100 MB.

La asociación seguirá siendo atómica respecto al mensaje y mantendrá la
emisión Socket.IO existente.

### Cliente

El compositor mantendrá visible el botón de adjuntar mientras el chat permita
enviar mensajes. Se eliminará únicamente la condición visual que espera el
acuerdo y el vencimiento de `freeCancelUntil`; se conservará la condición del
plan y los estados de carga.

El cliente enviará el `workerId` del hilo al preparar cada adjunto cuando el
servicio esté pendiente. Las miniaturas, el cifrado, reintentos, previews y
mensajes de error existentes no cambiarán.

## Errores y seguridad

- Servicio cancelado o completado: rechazar con el error de servicio cerrado.
- Usuario ajeno o hilo inválido: rechazar con 403.
- Plan sin adjuntos: mantener `ATTACHMENTS_NOT_INCLUDED`.
- Archivo inválido, demasiado grande o incompleto: mantener las validaciones
  actuales.
- No se expondrán rutas físicas de almacenamiento.
- La descarga seguirá limitada al cliente y al trabajador del hilo; archivos
  pendientes solo podrán ser leídos por quien los subió hasta asociarse al
  mensaje.

## Verificación

Se comprobará:

1. cliente y trabajador pueden adjuntar antes del acuerdo en un plan permitido;
2. los adjuntos aparecen solo en el hilo correcto cuando hay varios
   trabajadores conversando sobre el mismo servicio;
3. el plan Gratis continúa bloqueado;
4. la ventana de 10 minutos ya no bloquea adjuntos, pero sigue funcionando
   para cancelación y llamadas;
5. servicios cancelados o completados rechazan nuevas cargas;
6. subida, asociación, recarga del historial y evento Socket.IO conservan el
   comportamiento actual;
7. TypeScript, build y workflow arrancan sin errores.
