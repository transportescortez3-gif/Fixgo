# Verificación manual de teléfono desde administración

## Objetivo

Permitir que un administrador verifique manualmente el teléfono de un usuario
cuando el SMS no llega, sin convertir la acción en un cambio silencioso dentro
del formulario general de edición de usuarios.

La acción debe conservar la unicidad de teléfonos verificados y dejar evidencia
persistente de quién verificó el teléfono, cuándo y por qué.

## Flujo administrativo

En la ficha de `/admin/users/:id` se mostrará el estado del teléfono y una
acción específica:

- `Verificar teléfono manualmente` si existe un teléfono no verificado.
- `Teléfono verificado` si ya está verificado.
- Sin acción si el usuario no tiene teléfono registrado.

La acción abrirá un diálogo que:

1. Mostrará el teléfono que será verificado.
2. Advertirá que la acción omite la validación SMS.
3. Exigirá una razón no vacía y con longitud mínima.
4. Exigirá una confirmación explícita.
5. Mostrará el resultado y la fecha de la verificación manual.

La casilla genérica `phoneVerified` se eliminará del formulario general de
edición para que las verificaciones no puedan hacerse sin auditoría.

## Endpoint

Agregar:

`POST /api/admin/users/:id/phone-verify-manual`

Requisitos:

- Autenticación y rol `admin`.
- Usuario objetivo existente y no administrador.
- Teléfono existente y normalizable a formato E.164.
- Razón válida.
- El teléfono no puede estar verificado por otra cuenta.

La operación actualiza `phoneVerified=true` y
`phoneVerifiedAt=new Date()` dentro de una transacción. Si el teléfono ya está
verificado en la misma cuenta, debe responder de forma idempotente sin crear un
segundo registro de auditoría.

El endpoint nunca cambia el número telefónico; solo verifica el número ya
registrado en la cuenta.

## Auditoría

Crear una tabla `admin_phone_verifications` con:

- id
- userId
- adminId
- phone
- reason
- method, con valor `manual_admin`
- createdAt

La fila conserva el número verificado en el momento de la acción. Las lecturas
del detalle de usuario mostrarán el último registro manual junto con el nombre
del administrador y la fecha.

Los intentos rechazados por conflicto de teléfono se registrarán en el log del
servidor sin exponer datos innecesarios al cliente.

## Seguridad

- Solo administradores pueden invocar el endpoint.
- La razón es obligatoria para reducir verificaciones arbitrarias.
- La confirmación del frontend no sustituye las comprobaciones del backend.
- No se verifica un teléfono que pertenezca como verificado a otra cuenta.
- No se permite enviar un teléfono diferente en el cuerpo de la solicitud.
- No se registran contraseñas, tokens ni códigos SMS.
- La verificación manual queda diferenciada de una confirmación de Twilio.

## Validación

- Pruebas de acceso denegado para usuarios no administradores.
- Prueba de razón ausente o demasiado corta.
- Prueba de usuario sin teléfono.
- Prueba de conflicto con teléfono verificado en otra cuenta.
- Prueba de éxito y registro de auditoría.
- Prueba de idempotencia para un teléfono ya verificado.
- Verificar que el formulario general ya no puede modificar `phoneVerified`.
- Ejecutar TypeScript, migraciones y build frontend.