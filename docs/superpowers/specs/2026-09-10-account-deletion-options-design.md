# Opciones de eliminación de cuenta y datos

## Objetivo

Cumplir con la opción de Google Play que permite a una persona solicitar la eliminación de todos sus datos o solo de categorías específicas sin cerrar su cuenta, usando la página pública `/eliminar-cuenta`.

## Diseño aprobado

- El formulario tendrá dos opciones:
  - **Eliminar cuenta completa**: solicita la eliminación de la cuenta y de todos los datos que puedan eliminarse.
  - **Eliminar datos seleccionados**: mantiene la cuenta activa y permite elegir categorías concretas.
- Las categorías parciales serán:
  - Perfil y datos personales.
  - Fotos y portafolio.
  - Documentos KYC y selfies de seguridad.
  - Ubicación e historial de ubicación.
  - Adjuntos y contenido del chat.
  - Notificaciones y preferencias.
- Toda solicitud seguirá requiriendo verificación manual de identidad. El formulario no ejecutará eliminaciones por sí mismo.
- La respuesta pública será genérica y las solicitudes pendientes se deduplicarán por correo y tipo de solicitud, para evitar enumeración de cuentas y spam.
- El panel administrativo mostrará el tipo y las categorías solicitadas, junto con las notas internas y el estado de gestión.
- La página explicará qué datos pueden conservarse por obligaciones legales, seguridad, facturación, auditorías o reclamos.

## Cambios de datos y API

- Añadir `request_type` (`full` o `partial`) a `account_deletion_requests`.
- Añadir `data_categories` como arreglo de categorías seleccionadas.
- Mantener el endpoint público y los endpoints administrativos existentes, ampliando la validación y la respuesta.

## Validación y pruebas

- Una solicitud completa no necesita categorías.
- Una solicitud parcial requiere al menos una categoría válida.
- Se conservarán los límites actuales de tamaño, rate limit, honeypot y deduplicación.
- Verificar TypeScript, build, migración, respuesta pública y renderizado de las dos variantes del formulario.