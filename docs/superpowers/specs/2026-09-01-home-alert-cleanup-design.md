# Limpieza de alertas flotantes de Home

## Objetivo

Evitar que las tarjetas flotantes de Home se acumulen cuando un mismo trabajo
avanza por varias etapas. Home debe mostrar una sola tarjeta por trabajo
relacionado: la notificación no leída más reciente de ese trabajo.

El historial completo de notificaciones y su estado de lectura no se modifica
por esta reducción visual.

## Diseño

### Selección de alertas

`HomeAlerts` seguirá obteniendo las notificaciones no leídas y filtrando los
tipos aptos para mostrar en Home. Antes de renderizar:

1. Se agrupan las alertas que tienen el mismo `relatedId`.
2. Cada grupo conserva la alerta con mayor `createdAt`.
3. Si dos alertas tienen la misma fecha, gana la de mayor `id`.
4. Las alertas sin `relatedId` conservan una identidad individual basada en su
   propio `id`, evitando mezclar avisos globales.

La selección se extraerá a una función pura para que el criterio sea
determinista y testeable.

### Actualización y cleanup

La reducción se ejecutará en cada carga inicial y después de los eventos
`new_notification`, `notifications_updated`, `service_updated` y
`proposal_updated`. Cuando llega la notificación de una nueva etapa, la
tarjeta anterior deja de formar parte del estado renderizado y la tarjeta
reciente la reemplaza.

El cierre manual mantiene su comportamiento actual: elimina la tarjeta de
inmediato y marca únicamente esa notificación como leída en el backend. No se
marcarán automáticamente como leídas las notificaciones antiguas, para que
continúen disponibles en el centro de notificaciones.

### Flujo de cancelación y visita técnica

La secuencia de avisos de un mismo servicio, incluyendo cancelación,
creación del cargo, comprobante subido, confirmación de pago y resolución de
soporte, se tratará como un solo grupo visual. Por ello, Home mostrará solo el
último estado emitido para ese servicio, mientras que Mis Trabajos y el centro
de notificaciones conservarán el detalle completo.

### Verificación

Se probará la función pura con:

- Varias alertas del mismo servicio en orden de creación.
- Dos servicios distintos, que deben conservar una alerta cada uno.
- Alertas sin `relatedId`, que no deben fusionarse.
- Fechas iguales, usando `id` como desempate.
- La secuencia completa de cancelación y visita técnica.

Después se ejecutará la compilación, se revisará la consola del navegador y se
comprobará Home en tamaños desktop y móvil.