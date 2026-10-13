# Diseño: sanciones por cancelación tardía y administración privada de contactos

## Objetivo

Separar completamente:

1. El bloqueo administrativo aplicado desde el panel.
2. Las sanciones automáticas por cancelación tardía del experto.
3. La limpieza privada del historial de contactos y chats directos del usuario.

La separación evita que una acción administrativa se confunda con una sanción automática, que la limpieza de contactos altere el contador de sanciones o que borrar un chat de un usuario borre información del otro participante.

## Reglas de negocio

### Cancelación tardía del experto

Una cancelación cuenta solo cuando:

- El usuario que cancela es el experto asignado.
- El servicio estaba aceptado o en curso.
- Ya venció `freeCancelUntil`, es decir, pasaron los 10 minutos de gracia.

Las cancelaciones dentro de los 10 minutos no generan advertencia ni sanción.

El contador se reinicia al comenzar cada mes calendario. La secuencia dentro del mismo mes es:

| Infracción | Resultado |
| --- | --- |
| 1 | Primera advertencia |
| 2 | Segunda advertencia |
| 3 | Suspensión de 24 horas |
| 4 | Suspensión de 7 días |
| 5 o más | Suspensión de 30 días |

Después de la quinta infracción, las siguientes infracciones del mismo mes conservan el nivel máximo de 30 días.

Las advertencias no restringen la cuenta. Las suspensiones usan el modo restringido existente: se mantiene la sesión, se permite editar el perfil y contactar soporte, y se bloquean las operaciones del marketplace en servidor.

El mensaje de la segunda advertencia debe indicar que se trata de la segunda advertencia y que una tercera infracción produce una suspensión de 24 horas. Las notificaciones de las suspensiones deben indicar el nivel aplicado y su duración.

### Bloqueo administrativo

El bloqueo administrativo permanece en `admin_user_blocks` y puede ser aplicado por un administrador con cualquiera de sus duraciones permitidas. Sus características no cambian:

- Puede afectar a clientes o expertos.
- Puede ser temporal o indefinido.
- Solo el flujo administrativo puede desbloquearlo.
- Tiene su propio historial, estado y acción de desbloqueo.

No se debe convertir una sanción automática en `status = blocked`, ni mostrar una suspensión automática como bloqueo administrativo.

La lista administrativa de bloqueados debe mostrar únicamente bloqueos administrativos activos y mantener el botón de desbloqueo. Las suspensiones automáticas no se agregan a esa lista.

## Persistencia de sanciones

Se agregará un historial independiente de eventos de cancelación tardía. Cada evento debe conservar como mínimo:

- Experto sancionado.
- Servicio asociado.
- Inicio del mes calendario al que pertenece.
- Número de infracción dentro de ese mes.
- Resultado aplicado (`warning_1`, `warning_2`, `suspended_24h`, `suspended_7d` o `suspended_30d`).
- Fecha de creación.

El servicio debe ser único dentro de este historial para que una solicitud repetida no duplique una infracción. El cálculo y la actualización de `suspendedUntil`, `isAvailable` y el historial se ejecutarán en una transacción con bloqueo de la fila del experto.

El historial de sanciones no dependerá de los registros que el usuario decida ocultar desde Mis Contactos. Los trabajos y eventos necesarios para auditoría, soporte y cumplimiento no se eliminarán físicamente.

## Administración de contactos

### Acceso

Dentro de la pestaña **Mis Contactos** se agregará un botón **Administrar contactos**. Abrirá un diálogo o panel con:

- Eliminar contactos de hace más de 3 meses.
- Eliminar contactos de hace más de 6 meses.
- Eliminar todo el historial anterior.

Las tres acciones requieren confirmación explícita.

### Alcance

Las acciones aplican al historial anterior visible para el usuario actual. La fecha de corte se basa en la fecha histórica de la relación o trabajo que usa la tarjeta de contacto.

Nunca se eliminarán ni ocultarán:

- Trabajos activos.
- Contactos con un trabajo aceptado o en curso.
- Chats asociados a trabajos vigentes.
- Eventos de cancelación tardía o registros de auditoría.

El historial de trabajo se ocultará de la vista del usuario mediante un registro de eliminación privada, en lugar de borrar la fila del servicio.

### Chats directos

La limpieza incluye únicamente chats directos relacionados con contactos de trabajos anteriores, no los chats de propuestas o trabajos actuales.

Como una conversación directa es compartida por dos usuarios, la eliminación será privada para quien confirma la acción. Se agregará una marca de eliminación/ocultamiento por usuario y conversación:

- El usuario que confirma deja de ver la conversación y sus mensajes.
- El otro participante conserva su conversación.
- Las filas compartidas no se borran físicamente.

La operación debe ejecutarse de forma atómica: actualizar el ocultamiento del historial y marcar los chats directos elegibles en una misma operación lógica. El cliente invalidará las consultas de Mis Contactos y chats al terminar correctamente.

## API y autorización

Las nuevas operaciones de administración de contactos deben:

- Requerir autenticación.
- Derivar el usuario objetivo desde `req.userId`; nunca aceptar un `userId` arbitrario del cliente.
- Validar una acción cerrada (`older_than_3_months`, `older_than_6_months` o `all_history`).
- Recalcular en servidor qué contactos cumplen el corte.
- Excluir siempre servicios activos o en curso.
- Ser idempotentes.
- Responder con el número de contactos y chats afectados para mostrar un resultado claro.

La lista administrativa y el desbloqueo seguirán protegidos por `requireRole("admin")`.

## Interfaz

El diálogo de administración debe:

- Explicar que las acciones afectan al historial del usuario actual.
- Mostrar una confirmación distinta para cada opción.
- Advertir que los chats directos ocultados no volverán a aparecer para ese usuario.
- Indicar que los trabajos activos y la información de soporte no se modifican.
- Mostrar estados de carga, error y éxito.

La pantalla administrativa de bloqueados conserva su lista, contador y acción **Desbloquear ahora**, sin mezclar suspensiones por cancelación tardía.

## Pruebas

Se cubrirán como mínimo:

1. Primera y segunda infracción generan advertencias y no suspensión.
2. Tercera, cuarta y quinta infracción generan 24 horas, 7 días y 30 días.
3. La sexta infracción mantiene el máximo de 30 días.
4. Un evento en un mes nuevo vuelve a ser la primera infracción.
5. Una cancelación dentro de los 10 minutos no genera evento.
6. Reintentos concurrentes o repetidos del mismo servicio no duplican la sanción.
7. Un bloqueo administrativo sigue siendo independiente de `suspendedUntil`.
8. Solo los bloqueos administrativos aparecen en la lista admin y pueden desbloquearse allí.
9. Cada opción de limpieza exige confirmación.
10. Los cortes de 3 y 6 meses respetan la fecha calculada en servidor.
11. Los trabajos activos y sus chats quedan protegidos.
12. La limpieza del usuario A no elimina la conversación del usuario B.
13. La limpieza no altera el historial mensual de sanciones.