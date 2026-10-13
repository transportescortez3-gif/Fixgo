# Escalamiento de advertencias por cancelación tardía del experto

## Objetivo

Evitar que una cancelación tardía bloquee inmediatamente al experto. La primera y
segunda cancelación tardía del mes deben generar advertencias persistentes; la
tercera debe activar una suspensión temporal de 24 horas.

## Regla de negocio

- Solo cuentan cancelaciones hechas por el experto sobre servicios `accepted` o
  `in_progress`, cuando ya venció `free_cancel_until`.
- El conteo se calcula por mes calendario y debe incluir la cancelación actual.
- Cancelaciones dentro de los 10 minutos no cuentan.
- En la cancelación 1 y 2 no se cambia `suspended_until` ni `is_available`.
- En la cancelación 3 se escribe `suspended_until = now + 24h`; en la 4, `+7d`;
  en la 5 y siguientes, `+30d`. En todos esos casos se establece
  `is_available = false`.
- El historial `suspension_count` continúa incrementándose, pero la decisión de
  bloquear se basa en el conteo de cancelaciones tardías del mes.

## Notificaciones

Se agrega un tipo `account_warning` para que las dos advertencias no se
confundan con una suspensión. Cada advertencia se guarda en notificaciones y se
emite por Socket.IO, de modo que aparece aunque el usuario no esté mirando la
pantalla en el instante de cancelar. La tercera usa el flujo existente de
`account_suspension`.

## Implementación

- En la transacción de cancelación se cuentan únicamente filas con
  `cancelled_at > free_cancel_until`.
- La rama de sanción decide entre warning y suspensión después de obtener el
  conteo bloqueado por fila de usuario.
- El cliente invalida/actualiza sus notificaciones y muestra una alerta
  persistente para advertencias y suspensiones.

## Verificación

- Pruebas unitarias de conteo y decisión: primera y segunda son warnings; tercera
  suspende; una cancelación dentro de ventana no cambia el nivel.
- TypeScript, build, `git diff --check` y captura visual de la alerta.