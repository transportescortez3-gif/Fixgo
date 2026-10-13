---
title: Motor de Solicitudes — Interfaz Inmersiva y Reglas de Asignación
date: 2026-06-06
status: approved
author: Fixxer Engineering
---

# Motor de Solicitudes — Diseño Técnico

## Contexto y Objetivo

Fixxer migra del modelo de notificaciones pasivas (banner pequeño) a un motor de distribución activa con interfaz inmersiva. El objetivo es garantizar que cada solicitud de cliente sea capturada por un experto, priorizando cercanía y equidad, sin bloquear la negociación paralela.

Decisiones clave acordadas con el usuario:
- El flujo de propuestas se **transforma** (no reemplaza ni superpone): las propuestas existentes adoptan nuevos estados para el doble match.
- La "puntuación de convivencia" del cliente = **promedio de estrellas del sistema de reseñas existente**.
- La dirección del cliente = **solo distancia en km** (sin texto de dirección ni reverse geocoding).
- Arquitectura elegida: **Opción B — Refactorización de estados** (extensión limpia del enum `service_status`).

---

## 1. Cambios de Base de Datos

### 1.1 Extensión de `service_status` enum

Nuevos valores añadidos al enum existente:

| Valor | Significado |
|-------|-------------|
| `alerting` | Fase activa — pantalla completa enviada a los 4-5 expertos seleccionados (15 s) |
| `open` | Fase pasiva — pozo de solicitudes disponibles visible para cualquier experto del rubro |

El flujo completo de estados queda:
```
alerting → open → in_progress → completed
              ↘ cancelled
(pending queda para solicitudes directas sin cambios)
```

### 1.2 Nueva tabla `alert_sessions`

Registra el ciclo de vida de cada alerta enviada a cada experto para un servicio dado.

```sql
CREATE TABLE alert_sessions (
  id          SERIAL PRIMARY KEY,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  worker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  response    VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'skipped' | 'viewed'
  responded_at TIMESTAMP,
  UNIQUE (service_id, worker_id)
);
```

Esta tabla permite al motor saber qué expertos ya recibieron alerta para un servicio (y evitar re-enviarles en el bucle del minuto).

### 1.3 Nueva columna en `users`

```sql
ALTER TABLE users ADD COLUMN alert_cooldown_until TIMESTAMP;
```

- `NULL` → sin cooldown, elegible para alertas activas.
- `TIMESTAMP` → excluido de Fase Activa hasta esa fecha/hora.
- Se setea a `NOW() + INTERVAL '4 hours'` cuando un experto cierra un trato.

### 1.4 Extensión de `proposal_status` enum

Nuevos valores:

| Valor | Significado |
|-------|-------------|
| `open_chat` | Experto entró al chat (intención de negociar, creado automáticamente al acceder al hilo) |
| `worker_accepted` | Experto presionó "Aceptar Trabajo" |

Flujo completo de la propuesta:
```
open_chat → worker_accepted → accepted (cliente confirmó)
                           ↘ rejected (otro experto fue elegido)
```

Los estados `pending`, `countered`, `rejected` se mantienen para compatibilidad.

---

## 2. Motor Backend

**Archivo:** `server/lib/service-motor.ts`

### 2.1 Inicio de Fase Activa

Invocado desde `POST /api/services` cuando el servicio es público (`isDirectRequest = false`).

```
1. Cambiar servicio a status = 'alerting'
2. Consultar candidatos:
   - Online (disponible)
   - Misma categoría del servicio (worker_categories)
   - Radio 5-10 km del servicio (Haversine, ya implementado en /workers/nearby)
   - Sin cooldown activo (alertCooldownUntil IS NULL OR alertCooldownUntil < NOW())
   - No hayan recibido alerta para este servicio antes (LEFT JOIN alert_sessions)
3. Ordenar por distancia ASC, tomar los primeros 4-5
4. Insertar registros en alert_sessions (response = 'pending')
5. Emitir socket service:active_alert a cada experto seleccionado
6. Armar timer de 15 s por experto en memoria (Map<sessionId, NodeJS.Timeout>)
```

### 2.2 Respuesta del Experto a la Alerta

- **"Ver solicitud":** `PATCH /api/alert-sessions/:serviceId/view`
  - `alert_session.response = 'viewed'`
  - Cancela el timer de ese experto
  - Crea propuesta con estado `open_chat` si no existe
  - Redirige al chat del experto

- **"Omitir":** `PATCH /api/alert-sessions/:serviceId/skip`
  - `alert_session.response = 'skipped'`
  - Cancela el timer de ese experto
  - Verifica si todos los del lote ya respondieron → si sí, ejecutar Transición a Fase Pasiva

- **Timer agotado (server-side):**
  - Marca `alert_session.response = 'skipped'`
  - Emite `service:alert_expired` al experto
  - Verifica si todos respondieron → ejecutar Transición a Fase Pasiva

### 2.3 Transición a Fase Pasiva

Se activa cuando **todos** los expertos del lote actual han respondido (`skipped` o `viewed` sin confirmar aún).

```
1. servicio.status = 'open'
2. Emitir service:available a todos los expertos del rubro en radio extendido
3. Registrar open_since = NOW() en servicio (para el bucle del minuto)
```

### 2.4 Bucle del Minuto (Cron)

Cron job cada 30 segundos (integrado en `server/lib/subscription-cron.ts` o archivo propio).

```
SELECT servicios WHERE status = 'open'
  AND open_since < NOW() - INTERVAL '60 seconds'

Para cada uno:
  → Re-ejecutar Fase Activa (punto 2.1)
  → Excluir workers que ya tienen alert_session para ese servicio
  → Si no hay candidatos nuevos: mantener en 'open' y esperar siguiente ciclo
```

### 2.5 Cierre del Trato (Confirmación del Cliente)

Invocado desde `POST /api/proposals/:id/accept` (reutiliza el endpoint existente).

```
1. Propuesta ganadora → status = 'accepted'
2. servicio.status = 'in_progress', servicio.workerId = experto ganador
3. Todas las demás propuestas del servicio → status = 'rejected'
4. Emitir service:taken a todos los participantes del servicio
5. SET users.alertCooldownUntil = NOW() + '4 hours' para el experto ganador
6. Crear notificación de confirmación para ambas partes
```

### 2.6 Solicitudes Directas

Las solicitudes directas (`isDirectRequest = true`) **no pasan por el Motor**. Mantienen el flujo actual: status `pending`, notificación directa al `directWorkerId`, propuesta `pending` estándar.

---

## 3. Nuevos Eventos Socket.IO

| Evento | Dirección | Payload | Efecto en receptor |
|--------|-----------|---------|-------------------|
| `service:active_alert` | Server → Worker(s) | `{ serviceId, title, clientName, convivenciaScore, distanceKm, categoryIcon }` | Abre `ServiceAlertModal` a pantalla completa |
| `service:alert_expired` | Server → Worker | `{ serviceId }` | Cierra modal si sigue abierto |
| `service:available` | Server → Workers zona | `{ serviceId, title, categoryId, distanceKm }` | Agrega card a lista pasiva |
| `service:taken` | Server → Todos participantes | `{ serviceId }` | Modal/chat muestra "Trabajo tomado" |
| `service:worker_accepted` | Server → Cliente | `{ serviceId, workerId, workerName }` | Muestra banner + botón "Confirmar Experto" en el chat |

---

## 4. Frontend — Experto

### 4.1 `ServiceAlertModal.tsx`

Componente montado en el layout del experto (`client/components/layout.tsx`). Siempre escucha el evento `service:active_alert` vía Socket.IO.

**Estructura visual (pantalla completa, z-index máximo):**
```
┌─────────────────────────────────┐
│  🔔  SOLICITUD NUEVA            │
│                                 │
│  [Avatar] Juan Pérez  ★ 4.8    │  ← nombre + convivencia
│                                 │
│  "Cortar el césped de mi casa"  │  ← título del servicio
│                                 │
│  📍 A ~2.2 km de ti             │  ← distancia calculada
│                                 │
│    [Ring SVG 15s]               │  ← cuenta regresiva circular
│         14                      │
│                                 │
│  [ Ver solicitud ]  [ Omitir ]  │
└─────────────────────────────────┘
```

**Detalles de implementación:**
- Overlay: `fixed inset-0 z-[9999] bg-background flex flex-col`
- Ring: SVG `<circle>` con `strokeDashoffset` animado via `useEffect` + `requestAnimationFrame`
- Audio: `OscillatorNode` (Web Audio API) — 880 Hz, 100ms on / 300ms off, en bucle mientras modal activo
- Vibración nativa: `navigator.vibrate([200, 100, 200])` en bucle (si disponible)
- Al montar: emitir `service:alert_viewed` al servidor
- Al desmontar: detener audio y cancelar animación

**Botones:**
- **"Ver solicitud":** PATCH skip → navegar a `/services/:id`
- **"Omitir":** PATCH skip → cerrar modal

### 4.2 Lista Pasiva — "Solicitudes disponibles"

Nueva sección en el home del experto (`client/components/worker-home.tsx`):
- Solo muestra servicios con `status = 'open'`
- Escucha `service:available` (agrega cards en tiempo real)
- Escucha `service:taken` (remueve cards en tiempo real)
- Cada card: título, categoría, distancia, botón "Ver"
- Al tocar "Ver": crea propuesta `open_chat` + navega al chat

**Endpoint nuevo:** `GET /api/services/available?lat=&lng=&radius=20`  
Devuelve servicios en estado `open` dentro del radio del experto, en la categoría correcta.

---

## 5. Frontend — Cliente

### 5.1 Botón "Confirmar Experto"

En la vista de chat de cada hilo del servicio (`client/pages/services/[id].tsx` o equivalente):
- Cuando `proposal.status === 'worker_accepted'`, mostrar banner:
  ```
  ┌─────────────────────────────────┐
  │ ✅ [Nombre] está listo para     │
  │    comenzar                     │
  │                                 │
  │  [ Confirmar Experto ]          │
  └─────────────────────────────────┘
  ```
- El botón llama al endpoint existente `POST /api/proposals/:id/accept`
- Si hay múltiples expertos con `worker_accepted`, cada uno muestra su propio banner en su hilo de chat

### 5.2 Estado "Trabajo tomado"

Al recibir `service:taken`:
- En hilos de expertos NO confirmados: mostrar mensaje del sistema `"Este trabajo fue tomado por otro profesional"` y deshabilitar el campo de texto

---

## 6. API Endpoints Nuevos / Modificados

| Método | Ruta | Descripción |
|--------|------|-------------|
| `PATCH` | `/api/alert-sessions/:serviceId/view` | Registra 'viewed', crea propuesta open_chat |
| `PATCH` | `/api/alert-sessions/:serviceId/skip` | Registra 'skipped', dispara check de fase pasiva |
| `GET` | `/api/services/available` | Lista servicios en fase pasiva para un experto |
| `POST` | `/api/services/:id/worker-accept` | Experto presiona "Aceptar Trabajo" → propuesta a worker_accepted |
| `POST` | `/api/proposals/:id/accept` | (existente, modificado) → cierra trato, aplica cooldown, emite service:taken |

---

## 7. Reglas de Negocio Consolidadas

1. **Ocultamiento:** Servicios en `alerting` NO aparecen en la lista pasiva de ningún experto.
2. **Sin bloqueo temprano:** Múltiples expertos pueden estar en `open_chat` simultáneamente para el mismo servicio.
3. **Doble match:** El trato solo se sella con (a) experto en `worker_accepted` + (b) cliente confirma.
4. **Cancelación automática:** Al confirmar, TODOS los otros chats del servicio reciben `service:taken` instantáneamente.
5. **Cooldown 4h:** Solo afecta la Fase Activa. El experto en cooldown puede acceder manualmente a la lista pasiva.
6. **Bucle del minuto:** Re-corre Fase Activa cada 60s acumulados en `open`, excluyendo candidatos ya alertados.
7. **Solicitudes directas:** Bypass completo del motor — flujo actual sin cambios.

---

## 8. Archivos a Crear / Modificar

### Nuevos
- `server/lib/service-motor.ts` — Motor de distribución principal
- `server/routes/alert-sessions.ts` — Endpoints view/skip
- `client/components/service-alert-modal.tsx` — Modal pantalla completa
- `migrations/XXXX_motor_solicitudes.sql` — Migración DB

### Modificados
- `server/db/schema/services.ts` — Nuevos valores enum
- `server/db/schema/proposals.ts` — Nuevos valores enum
- `server/db/schema/users.ts` — Campo alertCooldownUntil
- `server/routes/services.ts` — Integrar motor en POST /services, nuevo GET /available
- `server/routes/proposals.ts` — Modificar accept para cooldown + service:taken
- `server/lib/socketio.ts` — Nuevos eventos
- `server/lib/subscription-cron.ts` — Bucle del minuto
- `client/components/layout.tsx` — Montar ServiceAlertModal en worker layout
- `client/components/worker-home.tsx` — Sección lista pasiva
- `client/pages/services/index.tsx` — Botón "Confirmar Experto" en chat cliente

---

## 9. Fuera de Alcance (explícito)

- ❌ Ningún precio, comisión o monto se registra
- ❌ Sin billetera ni saldo
- ❌ Sin PayPal
- ❌ Los mensajes de chat no se guardan en texto plano (E2E fase futura, no tocar aquí)
- ❌ Sin deep links a Google Maps/Waze (se implementan solo cuando el servicio está `in_progress`, fuera de este motor)
