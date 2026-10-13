# Nombres de cliente y experto en Fixgo y Fixxer Expertos

**Estado:** diseño aprobado para revisión de especificación.

## Objetivo

Unificar el lenguaje visible de las dos aplicaciones: llamar **cliente** a quien solicita servicios y **experto** a quien los ofrece, sin alterar el funcionamiento ni cambiar el sentido de referencias neutrales.

## Alcance

Aplicar el cambio a los textos que una persona ve en Fixgo y Fixxer Expertos: navegación, títulos, botones, formularios, placeholders, textos accesibles, estados vacíos, diálogos, notificaciones y mensajes de error que se muestran directamente en la interfaz. Se modificarán las fuentes compartidas de web/móvil; los artefactos nativos compilados se regenerarán desde esas fuentes cuando corresponda, no se editarán a mano.

## Reglas de lenguaje

- Cuando **usuario/usuarios** nombra el rol de quien solicita un servicio, cambiar a **cliente/clientes**, respetando mayúsculas y concordancia.
- Cambiar **profesional/profesionales** a **experto/expertos**, ajustando singular, plural y la frase para que suene natural.
- Cuando **usuario** significa cualquier cuenta o participante, usar **cuenta** o **persona** según el contexto, sin llamar cliente a un experto.
- Revisar cada frase como texto completo; no hacer sustituciones globales ciegas.

## Límites e invariantes

- No cambiar términos y condiciones, privacidad, cookies ni otros textos legales.
- No cambiar comentarios internos ni documentación.
- No renombrar roles internos, enums, columnas, rutas, endpoints, eventos, claves de almacenamiento, analíticas ni identificadores. Por ejemplo, los valores técnicos de rol `client` y `worker` permanecen intactos.
- No modificar flujos de autenticación, permisos, navegación ni comportamiento funcional.
- Mantener las marcas Fixgo y Fixxer Expertos tal como están.

## Verificación

1. Revisar las apariciones de los términos en las dos interfaces y clasificar cada una como rol cliente, rol experto, referencia neutral, texto legal o elemento interno.
2. Confirmar que las etiquetas de rol y mensajes visibles usan la terminología acordada y la concordancia correcta.
3. Buscar de nuevo los términos en el código fuente; revisar manualmente cada resultado restante para confirmar que es neutral, legal o interno.
4. Ejecutar el build y el chequeo de tipos de ambos proyectos.
5. Revisar en preview las pantallas públicas, navegación por rol y los estados de chat/solicitud que muestran los nombres.
