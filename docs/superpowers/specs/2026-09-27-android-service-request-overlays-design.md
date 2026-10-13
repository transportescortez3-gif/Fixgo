# Alertas de solicitudes Android: pantalla completa y ventana flotante

## Estado

Diseño aprobado e implementado. La verificación TypeScript y el build web pasan;
la compilación Android requiere un SDK que no está instalado en este entorno.
La validación en un dispositivo Android sigue pendiente.

Este documento actualiza una sola decisión del diseño
`2026-09-27-expert-alert-busy-and-arrival-design.md`: para las notificaciones
Android de nuevas solicitudes (`service_request`) sí se intentará una
presentación a pantalla completa y, con permiso explícito, una ventana flotante.
El cambio no se extiende a llamadas, avisos de llegada, otros tipos de push,
iOS ni web. Si ambos documentos difieren para esa ruta Android, prevalece este
diseño. Las demás reglas de reservas, vencimiento y cola del documento anterior
se conservan.

## Objetivo

Dar al experto una forma de notar y abrir una nueva solicitud aunque FixMaster
esté en segundo plano y esté usando otra aplicación, sin prometer que Android
pueda mostrar siempre una pantalla encima de todo.

## Estrategia de presentación

La ruta depende del estado del dispositivo:

1. **FixMaster está en primer plano:** conservar la alerta actual de la app.
   No abrir una actividad nativa ni mostrar otra notificación para la misma
   entrega.
2. **Pantalla apagada o bloqueada:** publicar una notificación de alta
   prioridad con un `fullScreenIntent` a una actividad nativa específica para
   solicitudes. Android puede mostrar la actividad en la pantalla bloqueada;
   si deniega o degrada la intención, permanece la notificación urgente.
3. **Pantalla encendida y otra app visible:** si el experto ya concedió el
   permiso especial de mostrar sobre otras aplicaciones, presentar una ventana
   flotante nativa para la solicitud. Sin ese permiso, o si el sistema impide
   mostrarla, presentar la notificación urgente existente.

Se muestra una sola presentación prominente por entrega. La ventana flotante no
debe acompañarse de una segunda alerta sonora o banner de la misma solicitud.
Cuando la presentación flotante sí aparece, se conserva un acceso de
notificación silencioso en la bandeja; el fallback urgente se usa si no fue
posible mostrar la ventana. El acceso silencioso debe usar un canal de baja
importancia separado y versionado, sin cambiar ni eludir el canal urgente que
el usuario ya configuró.

La actividad de solicitud será independiente de `IncomingCallActivity`. No debe
heredar ni imitar las acciones de contestar/rechazar una llamada. Tampoco se
intentará eludir restricciones de Android abriendo una actividad directamente
desde el servicio FCM.

## Permiso flotante

El permiso `SYSTEM_ALERT_WINDOW` requiere una decisión explícita de la persona
en la configuración especial de Android. FixMaster no puede dibujar una ventana
flotante antes de recibirlo.

- En la primera solicitud para la que el permiso no esté concedido, primero se
  usa la ruta disponible: intento de pantalla completa cuando corresponda y, de
  otro modo, notificación urgente.
- Cuando la persona abre esa solicitud en FixMaster, se presenta una explicación
  única y voluntaria con una acción para ir a la configuración de Android. No se
  abre Ajustes sin una acción explícita de la persona.
- Si concede el permiso, las solicitudes futuras pueden usar la ventana
  flotante mientras otra app está visible.
- Si la persona lo deniega, sale de Ajustes o lo revoca más tarde, la solicitud
  sigue usando la notificación urgente. No se repite automáticamente el
  mensaje de permiso en cada solicitud.

La primera solicitud no se oculta mientras la persona decide. Si la actividad
completa no está permitida, tocar la notificación abre FixMaster y muestra allí
la explicación.

## Contenido e interacciones

La pantalla completa y la ventana flotante comparten un resumen breve:

- marca FixMaster y etiqueta de nueva solicitud;
- título o tipo de trabajo;
- zona aproximada y antigüedad de la alerta, cuando estén disponibles;
- acción principal **Ver solicitud**;
- acción secundaria **Cerrar**.

No mostrar el nombre, teléfono, dirección exacta u otros datos personales del
cliente sobre otra aplicación o en la pantalla bloqueada. No mostrar precios ni
introducir ningún flujo de pago.

**Ver solicitud** abre el deep link existente a la solicitud dentro de
`MainActivity`; el flujo normal de FixMaster conserva el control de la decisión
del experto. La alerta no acepta ni rechaza automáticamente el trabajo.

**Cerrar** descarta solo la actividad o ventana que se está viendo. No omite la
solicitud, no libera su reserva y no adelanta la siguiente alerta. La
notificación sigue disponible en la bandeja hasta que venza el periodo vigente.
Esto conserva la decisión del usuario de esperar el vencimiento en lugar de
omitir la solicitud.

Al abrir la solicitud, el servidor sigue siendo la fuente de verdad: si la
entrega aún está pendiente, se aplica la transición existente a revisión y se
detiene el vencimiento de la alerta no respondida. Si la solicitud ya fue
asignada, cancelada o venció, no se continúa con una solicitud obsoleta; la app
informa que ya no está disponible y el ciclo actual del servidor libera o
reconcilia la reserva.

## Vigencia y entrega

Las alertas existentes ya tienen una fecha de vencimiento en el servidor; la
ventana de Socket.IO recibe el tiempo restante, pero el payload FCM de
`service_request` no lo incluye actualmente. El payload de la entrega debe
incluir la fecha de vencimiento asociada a su `deliveryId`, y la presentación
nativa debe cerrarse al alcanzar ese vencimiento. El identificador estable evita
que un temporizador de una entrega anterior cierre una alerta posterior.

Android seguirá usando mensajes FCM de datos para estas alertas. El servicio
nativo es el único responsable de presentar la alerta Android en segundo plano:
no se agregará un bloque FCM `notification` que genere otra notificación
automática ni se delegará esa misma alerta al plugin Capacitor. Los payloads web
e iOS conservan su comportamiento actual.

## Fuera de alcance

- Cambiar el ciclo de aceptación, omisión, reserva o cola de solicitudes.
- Convertir **Cerrar** en una acción de omisión o rechazo.
- Mostrar ventana flotante para `worker_arrived`, llamadas u otros push.
- Alterar la actividad de llamada entrante o su señalización.
- Cambiar las notificaciones de iOS o web.
- Anular el canal silenciado, los permisos de notificación, No molestar u otros
  controles del sistema.
- Garantizar una pantalla completa en todos los fabricantes o versiones de
  Android. Android puede convertirla en un aviso, impedirla o aplicar otras
  restricciones; la ventana flotante depende del permiso y del sistema.

## Manejo de fallos

- Sin permiso flotante: notificación urgente con enlace a la solicitud.
- Permiso concedido pero ventana no disponible: notificación urgente.
- Intención a pantalla completa denegada o degradada: notificación urgente.
- Permiso de notificación desactivado, canal silenciado o No molestar: respetar
  la decisión del sistema y conservar las rutas internas de la app.
- Permiso flotante revocado mientras FixMaster está suspendido: no intentar
  superar el control del sistema; volver a la notificación urgente.
- Solicitud vencida antes de tocar el aviso: cerrar la presentación nativa al
  vencer cuando sea posible y volver a validar con el servidor al abrir FixMaster.

## Verificación y criterios de aceptación

1. Con FixMaster abierto, una entrega produce solamente el aviso interno
   existente.
2. Con pantalla apagada o bloqueada, el sistema recibe la notificación de alta
   prioridad y se intenta abrir la actividad específica. Si Android lo bloquea,
   el enlace de notificación sigue disponible.
3. Con otra app visible y permiso flotante concedido, aparece una sola ventana
   flotante; no aparece una segunda alerta sonora/banner de esa misma entrega.
4. Sin permiso, con permiso denegado o revocado, la solicitud sigue llegando
   mediante notificación urgente y puede abrirse desde su enlace.
5. Denegar el permiso no provoca una secuencia de prompts en solicitudes
   posteriores.
6. **Cerrar** elimina solo la presentación visible, conserva la notificación y
   no libera la reserva antes de su vencimiento.
7. Una solicitud ya vencida, cancelada o asignada no se abre como si siguiera
   pendiente.
8. Una misma entrega repetida por socket/FCM o reconexión no muestra alertas
   duplicadas.
9. Avisos de llegada, llamadas, iOS y web mantienen su comportamiento actual.

Las pruebas de pantalla bloqueada, permiso especial, ventana sobre otra app,
No molestar y restricciones del fabricante deben verificarse en dispositivos
Android reales. El diseño no promete idéntico comportamiento en todos ellos.