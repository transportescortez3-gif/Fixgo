# Adjuntos en el chat cifrado — Diseño

**Fecha:** 2026-09-07  
**Estado:** Aprobado para especificación de implementación

## Objetivo

Permitir que clientes y expertos envíen fotos, videos, documentos, audio y
archivos comprimidos dentro de los chats de servicio y de propuestas. Las
fotos y videos deben tener previsualización; los demás archivos deben mostrarse
como tarjetas descargables. El chat de texto conserva su cifrado E2E.

Existe una excepción operativa acordada para soporte: cada adjunto tendrá una
copia cifrada para los participantes y una copia original legible, separada,
para revisión de reclamos. La copia legible no forma parte del chat ni se
entrega al cliente o experto.

## Decisiones aprobadas

- Se usará una tabla dedicada de adjuntos, no `imageUrl`.
- Se mantendrán dos objetos físicos por adjunto en la carpeta resuelta por
  `UPLOAD_DIR`.
- La copia E2E se elimina inmediatamente al completar o cancelar el servicio.
- La copia de soporte se conserva 7 días desde el cierre y luego se elimina.
- Máximo 5 archivos por mensaje y 100 MB acumulados por mensaje.
- Límites individuales: fotos 10 MB, videos 50 MB, documentos 25 MB, audio
  20 MB y comprimidos 50 MB.
- Se rechazarán ejecutables y scripts. Se permitirán formatos habituales de
  imágenes, videos, audio, PDF, documentos, hojas de cálculo, presentaciones
  y comprimidos.
- Los mensajes de texto seguirán almacenándose cifrados; soporte no podrá
  descifrarlos como parte de esta función.

## Arquitectura

### Cifrado y objetos

El cliente generará una clave AES-GCM aleatoria por archivo. Antes de subirlo,
cifrará el contenido completo y enviará únicamente el blob cifrado como copia
del chat. La clave del archivo, su IV y los metadatos necesarios para
previsualizarlo se cifrarán con la clave AES derivada del ECDH P-256 ya usado
por el chat. Cada operación usará IV nuevo y autenticará el identificador del
adjunto como contexto.

En paralelo, el cliente subirá el archivo original por TLS a un objeto
separado de soporte. Este objeto tendrá metadatos MIME internos para que
soporte pueda abrirlo desde el volumen o mediante una ruta administrativa
protegida. Nunca se devolverá su ruta a las respuestas del chat.

### Persistencia

Se agregará una tabla `message_attachments` con, como mínimo:

- `serviceId`, `messageId` nullable hasta vincular el mensaje y `uploaderId`.
- ruta del objeto cifrado y ruta del objeto de soporte.
- metadatos cifrados del archivo para el cliente.
- estado (`pending`, `active`, `deleted`) y fechas de creación, borrado de
  chat y borrado de soporte.
- `supportDeleteAt` calculado al cerrar el servicio.

La tabla tendrá índices por servicio, mensaje y estado. Los objetos serán
identificadores UUID sin nombres suministrados por el usuario.

### API y autorización

Se añadirá un flujo específico de adjuntos de chat para solicitar las dos
subidas, subirlas y vincularlas al mensaje. La solicitud comprobará sesión,
rol, participación y límites. El endpoint de mensajes aceptará una lista de
IDs de adjuntos pendientes y verificará que todos pertenecen al mismo
servicio, fueron subidos por el usuario actual y no están vinculados a otro
mensaje. La vinculación y el cambio a `active` serán atómicos.

La descarga de la copia cifrada requerirá que el solicitante sea el cliente o
el experto autorizado del hilo. Un usuario ajeno, un experto de otro hilo y
administración no podrán obtenerla desde el chat. La copia de soporte tendrá
una ruta administrativa separada, con autorización de soporte, registro de
usuario/servicio/adjunto/motivo y encabezados de descarga seguros. El endpoint
genérico de objetos no se usará para exponer adjuntos nuevos.

## Flujo de usuario

El compositor tendrá un botón de adjuntar y selección múltiple. Sobre el campo
de texto aparecerá una bandeja con:

- miniaturas locales para fotos;
- miniaturas con botón de reproducción para videos;
- icono, nombre y tamaño para audio, documentos y comprimidos;
- acción individual para quitar elementos antes de enviar.

La selección se valida en cliente para dar respuesta inmediata, pero el
servidor repite todas las validaciones. El botón de enviar se desactiva
mientras haya una subida pendiente. Cada archivo tendrá progreso, reintento y
eliminación independiente sin borrar el texto escrito.

En el historial, las fotos se mostrarán como miniaturas y los videos como
reproductores sin autoplay. Ambos se descifrarán en memoria y usarán URLs de
objeto temporales. El resto se mostrará como tarjeta descargable. Al cerrar el
servicio, el mensaje conservará su posición y mostrará
**“Adjunto eliminado al cerrar el trabajo”** cuando la copia E2E ya no exista.

El mismo componente y contrato se usarán en el chat de servicio y en el panel
de propuestas. La copia de soporte nunca se representará en la interfaz de
participantes.

## Cierre y retención

Todas las transiciones a `completed` o `cancelled`, incluidas las automáticas,
invocarán una rutina compartida e idempotente:

1. marca los adjuntos del servicio para eliminación;
2. elimina de inmediato la copia cifrada;
3. programa la copia de soporte para 7 días después;
4. emite la actualización necesaria para que el chat reemplace el contenido
   por el estado eliminado.

Un purgador periódico eliminará las copias de soporte cuyo plazo venció.
Después de borrar físicamente un objeto, actualizará su estado; si el borrado
falla, conservará el registro y reintentará. Las operaciones repetidas no
deben producir errores ni borrar archivos de otro adjunto.

Las subidas `pending` sin mensaje se limpiarán con una tarea de huérfanos
después de un plazo corto. Si una de las dos copias falla durante el envío, se
intentará eliminar la otra y no se creará el mensaje.

## Tipos y seguridad de archivos

Se aceptarán formatos comunes de imagen (JPEG, PNG, WebP y GIF), video (MP4,
MOV y WebM), audio (MP3, M4A, WAV y OGG), documentos (PDF, DOC/DOCX,
XLS/XLSX, PPT/PPTX, CSV y TXT) y comprimidos (ZIP, RAR, 7Z, TAR y GZ).
Se rechazarán ejecutables, scripts y formatos que el servidor no pueda
clasificar con seguridad. La validación considerará MIME, extensión, tamaño y
contenido básico; nunca se confiará únicamente en el nombre enviado por el
cliente.

Los archivos se servirán con `Content-Disposition: attachment` cuando se
descarguen como archivo. El cliente no insertará documentos ni comprimidos
como HTML ni ejecutará su contenido.

## Errores y estados parciales

- Sesión vencida: detener la subida y pedir iniciar sesión nuevamente.
- Límite excedido o tipo no admitido: explicar el límite y permitir quitar el
  archivo.
- Error de red: reintentar solo ese archivo.
- Fallo de cifrado: no subir ni conservar el original local como pendiente.
- Fallo de una copia: limpiar la otra y mantener el mensaje sin enviar.
- Evento Socket.IO perdido: la recarga del historial debe reconstruir el
  estado desde la API.
- Objeto eliminado o ausente: mostrar el estado eliminado, no una miniatura
  rota ni una ruta física.

## Verificación

La implementación deberá incluir pruebas para:

1. límites individuales, máximo de archivos, acumulado y formatos rechazados;
2. cifrado/descifrado de cada categoría y archivos cercanos al límite;
3. previsualización local, reproducción sin autoplay y descarga;
4. subida de ambas copias, asociación atómica y limpieza de huérfanos;
5. autorización de participantes y rechazo de usuarios ajenos;
6. acceso de soporte auditado sin exponer la ruta en el chat;
7. eliminación inmediata E2E y purga de soporte a los 7 días;
8. reintentos, fallos parciales, cierre automático y transiciones repetidas;
9. historial tras recarga, eventos en tiempo real y compatibilidad con WebView
   móvil.

No se cambiarán los estados del servicio, el cifrado de texto existente ni las
reglas legales de pagos. Tampoco se almacenará contenido binario en
PostgreSQL; la base de datos guardará rutas y metadatos.