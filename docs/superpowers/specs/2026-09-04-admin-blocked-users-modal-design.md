# Aviso de cuentas bloqueadas en Usuarios

## Objetivo

Avisar al administrador al entrar a la sección **Usuarios** cuando existan cuentas bloqueadas activas y ofrecerle un acceso directo a la lista completa para gestionarlas sin abrir cada perfil individualmente.

## Diseño aprobado

### Comportamiento

- Al montar la página `/admin/users`, el cliente consultará el endpoint existente `GET /api/admin/blocked-users`.
- El servidor ya filtra los bloqueos administrativos activos y expira primero los que corresponda.
- Si la respuesta contiene una o más cuentas, se abrirá un modal con el mensaje:
  - `Tienes X usuarios bloqueados`
- El modal tendrá:
  - `Ver cuentas bloqueadas`: navega a `/admin/blocked-users`.
  - `Ahora no`: cierra el modal y mantiene al administrador en Usuarios.
- El modal se mostrará una sola vez por entrada a la página. Una actualización/refetch dentro de la misma visita no debe reabrirlo repetidamente.
- Si no hay cuentas bloqueadas, no se mostrará ningún modal.

### Lista de gestión

Se reutilizará la pantalla existente `/admin/blocked-users`, que ya muestra la lista de cuentas bloqueadas activas y permite desbloquearlas directamente mediante `POST /api/admin/users/:id/unblock`.

No se agregará una acción de desbloqueo masivo: cada cuenta tendrá su acción individual visible en la lista para evitar desbloqueos accidentales.

### Manejo de errores

- Si la consulta del aviso falla, no se mostrará un contador potencialmente incorrecto y la pantalla Usuarios seguirá funcionando.
- La pantalla de lista conservará su manejo actual de errores, carga, estado vacío y actualización periódica.

## Cambios previstos

- Añadir un diálogo específico para el aviso de cuentas bloqueadas.
- Conectar la consulta al ciclo de vida de `client/pages/admin/users.tsx`.
- Reutilizar los componentes de diálogo y navegación existentes.
- No modificar el modelo de datos ni crear nuevos endpoints.

## Verificación

- Confirmar que el modal aparece con el número correcto cuando hay bloqueos.
- Confirmar que no aparece cuando la lista está vacía.
- Confirmar que `Ahora no` no navega.
- Confirmar que `Ver cuentas bloqueadas` abre la lista existente.
- Confirmar que el desbloqueo desde la lista elimina la cuenta de la lista y conserva el flujo actual.
- Ejecutar TypeScript, build y revisión visual del preview.