# Alertas exclusivas para expertos y flujo de llegada al domicilio

## Objetivo

Implementar dos flujos relacionados con trabajos:

1. Entregar una sola alerta de solicitud por vez a cada experto y detener nuevas
   alertas mientras revisa o negocia una solicitud. La disponibilidad debe
   controlarse desde el servidor, no depender solamente de la pantalla abierta.
2. Registrar la llegada del experto, avisar al cliente y comenzar un segundo
   plazo independiente de 10 minutos. Si el experto no inicia el trabajo antes
   de que venza, el servidor lo iniciará automáticamente.

El cliente y el experto también deben recibir una tarjeta llamativa en Inicio
para ir a Mis Trabajos cuando el trabajo se inicie. El mismo énfasis visual se
aplicará a la tarjeta pendiente de selfie de seguridad.

## Situación actual

- El motor envía `service:active_alert` por Socket.IO y también crea una
  notificación FCM de alta prioridad para el mismo experto. El servicio nativo
  de Android publica una notificación urgente y luego delega el mensaje al
  servicio de Capacitor, por lo que una solicitud puede mostrarse o sonar más
  de una vez.
- El modal de alertas conserva una cola en el cliente, pero el servidor no
  mantiene una reserva global por experto que impida que otros servicios le
  envíen alertas durante una negociación.
- Ver una alerta actualiza la sesión de ese servicio y puede abrir un chat; no
  hay una acción de servidor que libere al experto al salir de esa pantalla.
- El servicio no tiene marcas persistentes de llegada al domicilio o de inicio
  real del trabajo.
- `freeCancelUntil` representa la ventana de cancelación gratuita. El flujo de
  propuesta puede poner el servicio en `in_progress` antes de que el experto
  haya empezado físicamente el trabajo.
- El texto que indica que el experto va en camino se deriva del vencimiento de
  la ventana de cancelación; no existe una marca de llegada que confirme ese
  hecho.
- La tarjeta del experto que conduce a la selfie pendiente ya existe, pero no
  tiene el énfasis visual solicitado.

## Enfoques considerados

### 1. Estado de alerta y disponibilidad autoritativo en el servidor

Guardar una reserva de alerta por experto, coordinarla con el motor de
solicitudes y liberar la siguiente oferta vigente cuando el experto omita la
alerta o salga de la pantalla de revisión/negociación. Los trabajos asignados
mantienen al experto ocupado hasta completarse o cancelarse.

**Ventaja:** evita alertas simultáneas desde varios servicios, dispositivos o
reconexiones y permite volver a activar la cola al salir de la pantalla.

### 2. Bloqueo solamente en el cliente

Pausar el modal mientras una pantalla de negociación esté abierta.

**Desventaja:** el servidor seguiría enviando push a otros dispositivos y
reanudaría alertas de forma inconsistente tras una reconexión o un reinicio.

### 3. Pausa o limitador global de notificaciones

Reducir la cantidad de notificaciones mediante un cooldown general.

**Desventaja:** no representa el estado real del experto, retrasa ofertas
válidas y no sabe cuándo debe devolverlo a la cola.

## Diseño elegido

Se implementará el primer enfoque, aprobado por el usuario el 27 de septiembre
de 2026.

## Estado y entrega de alertas al experto

### Estado efectivo

La disponibilidad efectiva se determina en el servidor combinando:

- La preferencia de disponibilidad del experto (`isAvailable`).
- Una reserva temporal por experto para una alerta pendiente o una pantalla de
  revisión/negociación.
- La existencia de un servicio activo asignado al experto.

La reserva temporal debe ser única por experto y persistente en la base de
datos. La implementación puede utilizar una tabla nueva o una estructura
equivalente después de verificar el esquema actual, pero la exclusión debe
resolverse atómicamente en el servidor.

### Transiciones

1. **Disponible → alerta pendiente:** antes de enviar un evento o push, el
   servidor reserva una sola solicitud vigente para ese experto. Mientras esa
   oferta esté pendiente, no envía otra oferta de servicio al mismo experto.
2. **Alerta pendiente → revisando/negociando:** al abrir la solicitud o entrar
   en su conversación, la reserva queda activa y se cancela el vencimiento de
   la alerta no respondida.
3. **Alerta pendiente → disponible:** omitir o dejar vencer la oferta libera
   la reserva.
4. **Revisando/negociando → disponible:** salir de esa pantalla o cerrar la
   solicitud libera la reserva mediante una acción explícita del cliente al
   servidor. El servidor entonces vuelve a evaluar solicitudes vigentes y
   entrega como máximo una siguiente alerta.
5. **Servicio asignado → ocupado:** al aceptar/asignar un trabajo, el servicio
   asignado es la fuente de verdad para impedir nuevas alertas. La reserva no
   debe liberar al experto por salir de la pantalla del trabajo.
6. **Ocupado → disponible:** completar o cancelar el servicio permite que el
   experto vuelva a recibir alertas, sujeto a su preferencia de disponibilidad
   y a las demás reglas existentes.

Ir a WhatsApp, YouTube, la pantalla bloqueada o el fondo del sistema operativo
no equivale a salir de la pantalla de solicitud en Fixgo y no libera la
reserva. El cliente debe liberar la reserva al navegar fuera de la solicitud,
no cuando la app pasa a segundo plano. Al volver a abrir Fixgo, el servidor y
el estado de la ruta se reconcilian para recuperar reservas obsoletas que hayan
quedado tras un cierre inesperado, sin liberar una negociación activa por una
simple pérdida temporal de socket.

Las solicitudes que esperen mientras el experto está ocupado se conservan
solo mientras continúen vigentes. Al liberarse el experto, se reevalúan en
orden; las ya asignadas, canceladas o vencidas se descartan. Nunca se envía una
ráfaga de todas las ofertas acumuladas.

### Entrega de notificaciones

- Una misma oferta debe tener un identificador de entrega estable para deduplicar
  Socket.IO, FCM y reconexiones.
- En primer plano, la alerta visible y audible de Fixgo se presenta una sola
  vez.
- En segundo plano o con el teléfono bloqueado, Android recibe un mensaje FCM
  de alta prioridad y el servicio nativo publica una sola notificación urgente
  con sonido, vibración y visibilidad en la pantalla bloqueada.
- La notificación debe llevar el ID de la solicitud y abrir la solicitud
  correcta al tocarla.
- Para la ruta Android de estas alertas, no se debe enviar un bloque FCM
  `notification` que produzca una notificación automática adicional, ni
  delegar el mismo mensaje al plugin Capacitor después de que el servicio
  nativo ya lo publicó. Las notificaciones web/iOS conservan sus payloads
  compatibles.
- Se usará un canal Android versionado para aplicar la configuración de sonido
  a instalaciones que ya tienen creado el canal urgente actual. El canal tendrá
  importancia alta, el tono de alarma predeterminado del sistema y vibración.
- Las ofertas de trabajo no usarán una actividad de pantalla completa propia de
  llamadas. Android seguirá aplicando los permisos, el canal configurado por
  el usuario y No molestar.

## Llegada e inicio del trabajo

### Persistencia y semántica

Agregar marcas persistentes independientes para:

- `workerArrivedAt`: instante en que el experto toca “Llegué al domicilio”.
- `workStartedAt`: instante en que el experto inicia manualmente el trabajo o
  vence el plazo de 10 minutos desde `workerArrivedAt`.

No reutilizar `freeCancelUntil` para ninguno de estos datos. Tampoco cambiar el
significado actual de `in_progress`; `workStartedAt` distinguirá el inicio real
del trabajo de la asignación y negociación que ya usan ese estado.

### Acción de llegada

En la tarjeta del servicio activo del experto se mostrará:

- Botón: **Llegué al domicilio**.
- Descripción: “Se te darán 10 minutos para iniciar el trabajo. Si no lo inicias
  manualmente, se dará por iniciado automáticamente al finalizar el tiempo.”

Un endpoint autenticado permitirá la acción solo al experto asignado y para un
servicio todavía activo. La transición se hará de forma condicional e
idempotente para que un reintento no reinicie el plazo ni duplique avisos.

Al guardar `workerArrivedAt`, el servidor:

1. Emitirá una actualización de servicio a los participantes.
2. Guardará y enviará al cliente una notificación de alta prioridad con:
   - Título: **¡Tu experto llegó!**
   - Texto: **El experto ya está en tu domicilio esperando que le abras la
     puerta.**
3. Programará el inicio automático para `workerArrivedAt + 10 minutos`.

### Inicio manual o automático

- Después de registrar la llegada, el experto tendrá una acción “Iniciar
  trabajo” disponible antes del vencimiento.
- El inicio manual y el automático escribirán `workStartedAt` mediante una
  actualización atómica que solo puede aplicarse una vez.
- El vencimiento se calcula en el servidor desde `workerArrivedAt`, nunca desde
  el reloj local del navegador.
- Se utilizará un temporizador para la ejecución normal y una reconciliación
  periódica desde la base de datos para recuperar vencimientos tras un reinicio
  del servidor. La actualización condicional evita dos inicios si ambos caminos
  coinciden.
- El inicio no agregará una tarjeta ni un botón de confirmación al vencer; el
  cambio de estado ocurrirá en el servidor.

## Tarjetas y guía visual

Mientras exista un trabajo activo con `workStartedAt`:

- Cliente y experto verán en Inicio la tarjeta:
  **Para finalizar el trabajo, dirígete al perfil de Mis Trabajos.**
- El botón dirá **Ir a Mis Trabajos** y navegará a `/mis-trabajos`.
- Todas las tarjetas existentes de acción pendiente recibirán el mismo
  tratamiento visual; como mínimo, la tarjeta pendiente de selfie de seguridad
  y la nueva tarjeta de inicio.
- Se usará resaltado de alto contraste y una flecha o pulso sutil. Se respetará
  `prefers-reduced-motion`, manteniendo un énfasis estático si el usuario reduce
  el movimiento.

La tarjeta de inicio permanecerá visible para ambos roles mientras el trabajo
continúe activo. Los estados completado y cancelado no deben mostrarla.

## Validaciones de servidor y seguridad

- La reserva de alerta se adquiere de manera atómica y tiene una restricción que
  impide dos reservas temporales para el mismo experto.
- Todas las rutas de omitir, abrir, salir de la pantalla, asignar, cancelar y
  completar deben actualizar o liberar la reserva donde corresponda.
- Las transiciones de llegada e inicio verifican que el usuario sea el experto
  asignado y que el servicio no esté completado o cancelado.
- Llegada, inicio manual e inicio automático son idempotentes; un reintento no
  cambia timestamps ni duplica notificaciones.
- Los campos nuevos no se podrán modificar desde una actualización genérica de
  servicio enviada por el cliente.
- Los eventos de servicio y las notificaciones persistentes se emiten desde
  todos los write paths que puedan completar estas transiciones.

## Pruebas de aceptación

### Alertas del experto

- Dos servicios que intentan alertar al mismo experto no producen dos ofertas
  pendientes ni dos avisos a la vez.
- Al abrir o negociar una solicitud, no se envían nuevas alertas al experto.
- Cambiar a otra app o bloquear el teléfono conserva el estado de negociación.
- Omitir, vencer o salir de la pantalla libera el espacio y permite una sola
  oferta siguiente que siga vigente.
- Un servicio asignado mantiene ocupado al experto aunque salga de su pantalla.
- Reintentos, reconexión de Socket.IO y entrega FCM no duplican la misma alerta.
- Una alerta recibida en segundo plano o con el teléfono bloqueado abre el
  servicio correcto y crea una sola notificación nativa audible.

### Llegada e inicio

- Solo el experto asignado puede registrar la llegada o iniciar el trabajo.
- La llegada guarda una sola hora, manda el texto exacto al cliente y no altera
  la ventana de cancelación gratuita.
- El inicio manual antes de los 10 minutos evita el inicio automático.
- El inicio automático ocurre con el deadline del servidor y sobrevive a un
  reinicio, sin doble notificación ni doble transición.
- Cliente y experto ven la tarjeta de Inicio al comenzar el trabajo y deja de
  aparecer al completar o cancelar el servicio.
- La tarjeta de selfie y la tarjeta de inicio tienen énfasis visible, incluso
  con movimiento reducido.

## Fuera de alcance

- No se modificará la ventana de cancelación gratuita ni se inferirá la llegada
  desde su vencimiento.
- No se usará pantalla completa tipo llamada para alertas de servicio.
- No se promete anular la configuración de notificaciones, los canales
  silenciados o No molestar del sistema operativo.
- No se cambiará la lógica de pagos ni el flujo de finalización del trabajo,
  salvo el enlace visual a Mis Trabajos.