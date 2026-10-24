# Fixxer — Reporte de Bugs para Implementar

> **Para el agente implementador:** Este documento contiene el análisis exhaustivo de 4 bugs
> reportados por el usuario con sus imágenes de evidencia. Lee TODO antes de tocar código.
> El análisis ya fue validado contra los archivos fuente actuales.

---

## Contexto del proyecto

- Stack: React 19 + Vite, Express, Drizzle ORM, PostgreSQL, Socket.IO
- Marca: azul eléctrico (`hsl(213 100% 55%)`), tema oscuro siempre
- Idioma UI: español chileno
- **PROHIBIDO:** pagos entre usuarios, wallet, comisiones, texto plano en chat E2E
- Lenguaje: "Conectar" (no "contratar"), "Conversación archivada" (no "trabajo completado")

---

## Imágenes de evidencia del usuario

Las siguientes imágenes están en `attached_assets/` y muestran los bugs en producción.
El agente puede abrirlas para re-razonar si necesita contexto visual adicional.

```
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.49_AM_1784352408398.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.49_AM_(1)_1784355155119.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.49_AM_(2)_1784352408397.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.49_AM_(1)_1784355370591.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.50_AM_(1)_1784352408396.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.50_AM_1784352408397.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.50_AM_(2)_1784352408396.jpeg
attached_assets/WhatsApp_Image_2026-07-18_at_1.18.51_AM_1784352408395.jpeg
```

**Qué muestran las imágenes:**
- Notificación push de "EL JONA CORTEZ te envió un mensaje" llegando mientras el usuario está en otra pantalla/chat → Bug 1
- Chat de SONNY LAVERIANO abierto con mensajes recibidos via notificación → Bug 1
- Pantalla "¿Aún necesitas este servicio? Buscar de nuevo" apareciendo después de que ya aceptó un trabajador → Bug 4

---

## Bug 1 — Mensajes no aparecen al re-entrar al chat E2E

### Descripción del usuario
> "Cuando el usuario está fuera del chat y le llega notificación, al entrar al chat los mensajes
> no están. Solo aparecen si estaba dentro. Al salir y volver a entrar tampoco están.
> Afecta tanto cliente como trabajador."

### Archivo a modificar
`client/components/proposal-chat-sheet.tsx`

### Causa raíz (confirmada en el código)

**Líneas 179–189 — query de mensajes:**
```ts
const { data: messagesData } = useQuery({
  queryKey: messagesQueryKey,
  queryFn: () => { ... },
  enabled: open && !!serviceId,
  refetchInterval: false,
  staleTime: Infinity,      // ← PROBLEMA PRINCIPAL
});
```

**Líneas 313–319 — socket desactivado cuando chat cerrado:**
```ts
const { emitTyping, ... } = useSocket({
  serviceId: open ? serviceId : null,  // ← socket apagado cuando open=false
  ...
});
```

**El flujo problemático:**
1. Chat está abierto → mensajes recibidos por socket → `localMsgs` se llena
2. Usuario sale del chat → `open=false` → `localMsgs` se limpia (`[]`), `messagesLoaded=false`
3. Socket listener desactivado → mensajes nuevos del trabajador NO se reciben
4. Llega push notification con mensaje nuevo
5. Usuario abre el chat (`open=true`) → React Query activa la query
6. **`staleTime: Infinity`** → React Query sirve los datos cacheados OLD **sin refetch**
7. El efecto `[open]` (línea 197) llama `invalidateQueries` → debería forzar un refetch
8. PERO hay una race condition: el efecto `[open, messagesData]` (línea 207) ya corrió con
   los datos cacheados viejos (prev.length=0 → setLocalMsgs(fetched_viejo)). Cuando el
   refetch forzado llega, `prev.length > 0` y el merge debería agregar los nuevos... pero
   si `staleTime: Infinity` impide que el refetch se dispare realmente (React Query puede
   omitir refetches de queries activas recién activadas con cache fresco), los mensajes nuevos
   nunca aparecen.

### Fix

**Cambiar la query de mensajes** para garantizar siempre un fetch fresco al abrir el chat:

```ts
// ANTES (líneas 186-189):
enabled: open && !!serviceId,
refetchInterval: false,
staleTime: Infinity,

// DESPUÉS:
enabled: open && !!serviceId,
refetchInterval: false,
staleTime: 0,
refetchOnMount: 'always' as const,
```

Con `staleTime: 0`, cada vez que `enabled` pasa de false a true, la data en cache se
considera inmediatamente stale y React Query hace un fetch fresco. Esto elimina la race
condition y garantiza que al abrir el chat siempre se cargue el historial completo desde
la DB, incluyendo mensajes que llegaron mientras el usuario estaba fuera.

**IMPORTANTE:** El efecto de `invalidateQueries` de la línea 199 puede quedar como está
(es redundante pero no hace daño). No eliminar la lógica de merge en líneas 214-224.

---

## Bug 2 — Chat sigue activo después de marcar trabajo como completado

### Descripción del usuario
> "Cuando el cliente marca un trabajo como completado (status=completed), ambos (cliente y
> trabajador) siguen dentro del chat y pueden seguir escribiéndose. Debería ser readOnly/cerrado.
> El trabajador además puede entrar a la descripción del trabajo terminado."

### Archivos a modificar
- `client/pages/services/detail.tsx`

### Causa raíz 1 — Falta `readOnly` en el chat de negociación del cliente (CONFIRMADA)

**Líneas 1153–1192 en detail.tsx — chat del cliente por propuesta:**
```tsx
{isOwner && (() => {
  const chatProp = proposals?.find((p: any) => p.id === chatProposalId);
  if (!chatProp) return null;
  return (
    <ProposalChatSheet
      open={chatProposalId !== null}
      onOpenChange={(v) => { if (!v) setChatProposalId(null); }}
      serviceId={id}
      workerId={chatProp.workerId}
      ...
      // ← FALTA readOnly={isServiceClosed}
    />
  );
})()}
```

El `ProposalChatSheet` del trabajador SÍ queda bloqueado porque su condición de render
`isWorker && (isPending || service.status === 'in_progress')` se vuelve false al completar.
Pero el del cliente NO tiene `readOnly` → el cliente puede seguir escribiendo.

**Comparación con el chat persistente (línea ~1279) que SÍ está bien:**
```tsx
readOnly={isServiceClosed}  // ← este SÍ tiene readOnly correcto
```

### Causa raíz 2 — Status del servicio no se actualiza en tiempo real (CONFIRMADA)

El servicio en detail.tsx usa:
```ts
staleTime: 30_000,    // dato viejo por hasta 30s
refetchInterval: false // NO hay polling
```

El servidor SÍ emite el socket event correcto al completar (`services.ts` líneas 723-724):
```ts
emitToService(params.data.id, "service_updated", { serviceId: params.data.id, status: "completed" });
emitToUser(service.clientId, "service_updated", { serviceId: params.data.id, status: "completed" });
```

Pero `detail.tsx` NO tiene un listener para `service_updated`. El socket event llega al
service-room pero nadie en detail.tsx lo escucha → el status del servicio no se actualiza
en tiempo real → ambos usuarios siguen viendo `in_progress` hasta que manualmente
refrescan la página.

### Fix

**Paso 1:** Agregar `readOnly={isServiceClosed}` al `ProposalChatSheet` del cliente.

Buscar el bloque `{isOwner && (() => {` (aproximadamente línea 1153–1192) y agregar la prop:

```tsx
<ProposalChatSheet
  open={chatProposalId !== null}
  onOpenChange={(v) => { if (!v) setChatProposalId(null); }}
  serviceId={id}
  workerId={chatProp.workerId}
  workerName={chatProp.worker?.name || 'Especialista'}
  workerAvatar={chatProp.worker?.avatarUrl}
  acceptLabel="Confirmar trabajo"
  accepting={acceptProposalMutation.isPending}
  otherUserId={chatProp.workerId}
  proposalId={chatProp.id}
  budgetNote={(service as any).budgetNote || null}
  isPending={isPending}
  onCounter={...}
  onAccept={isActiveCh ? () => { onAcceptProposal(chatProp.id); } : undefined}
  onReject={isActiveCh ? () => { onRejectProposal(chatProp.id); setChatProposalId(null); } : undefined}
  readOnly={isServiceClosed}    // ← AGREGAR ESTA LÍNEA
/>
```

**Paso 2:** Agregar listener de socket para `service_updated` en detail.tsx.

`detail.tsx` ya importa `useSocket` o tiene acceso al socket. Agregar un `useEffect` que
escuche el evento `service_updated` del servidor e invalide la query del servicio:

```ts
// Al inicio del componente donde ya están los otros imports:
import { getSocket } from "@/hooks/use-socket";
// (o usar el socket que ya esté disponible en el componente)

// Dentro del componente, agregar este useEffect:
useEffect(() => {
  const socket = getSocket();
  if (!socket || !id) return;

  const handleServiceUpdated = (data: { serviceId: number; status: string }) => {
    if (data.serviceId !== id) return;
    queryClient.invalidateQueries({ queryKey: getGetServiceQueryKey(id) });
  };

  socket.on("service_updated", handleServiceUpdated);
  return () => {
    socket.off("service_updated", handleServiceUpdated);
  };
}, [id, queryClient]);
```

Verificar qué imports ya existen en detail.tsx para `getSocket`, `getGetServiceQueryKey`,
y `queryClient` antes de agregar duplicados. El `queryClient` probablemente ya está via
`useQueryClient()`, y `getGetServiceQueryKey` está importado de `@/api`.

---

## Bug 3 — Error al subir calificación desde Mis Trabajos

### Descripción del usuario
> "Desde Mis Trabajos, al intentar dar calificación, da error cada vez."

### Archivos relevantes
- `client/components/post-service-modal.tsx` — modal compartido de calificación
- `client/pages/mis-trabajos.tsx` — tiene dos flujos de calificación
- `server/routes/reviews.ts` — endpoints de reviews

### Análisis de flujos

Hay DOS flujos distintos de calificación desde Mis Trabajos:

**Flujo A — Cliente califica al trabajador** (líneas 484-527 de mis-trabajos.tsx):
- Botón "Calificar" → abre `PostServiceModal` con `counterpartId={service.worker.id}` y `serviceId={service.id}`
- `PostServiceModal.submitReview()` detecta `isClient=true` → llama `POST /api/reviews`
- Body enviado: `{ workerId: counterpartId, serviceId, rating: reviewStars, comment }`
- Servidor valida: `service.status === "completed"` ✓, `service.clientId === req.userId` ✓, `workerId === service.workerId` ✓

**Flujo B — Trabajador califica al cliente** (líneas 532-567 de mis-trabajos.tsx):
- `submitClientRating` llama directamente `POST /api/reviews/rate-client`
- Body enviado: `{ serviceId: svc.id, clientId: svc.clientId, rating: rateStars, comment }`
- Servidor valida: `service.status === "completed"` ✓, `service.workerId === req.userId` ✓, `clientId === service.clientId` ✓

### Causa raíz — Errores del servidor son silenciados

En `PostServiceModal` línea 82:
```ts
const res = await fetch(endpoint, { ... });
if (!res.ok) throw new Error();  // ← lanza sin mensaje, pierde el error real del servidor
toast.success("¡Gracias por tu calificación!");
```

En el catch:
```ts
} catch {
  toast.error("Error al enviar la calificación");  // siempre el mismo mensaje genérico
}
```

Esto hace IMPOSIBLE saber qué está fallando realmente. El servidor puede estar devolviendo
mensajes específicos (ej. "Ya calificaste este servicio", "El profesional indicado no
corresponde a este servicio") pero se pierden.

Igual problema en `submitClientRating` de mis-trabajos.tsx línea 567:
```ts
toast.error("Error al enviar la calificación");  // sin leer el body del error
```

### Posibles causas del error server-side a investigar

El agente que implemente debe primero mejorar el error handling para VER el error real,
y luego corregir la causa que aparezca:

1. **"El profesional indicado no corresponde a este servicio"** → `parsed.data.workerId !== service.workerId`
   Puede pasar si `service.worker.id` no coincide con `service.workerId` en la DB.

2. **"Ya calificaste este servicio"** → review duplicada. La UI no verifica `reviewedByClient`
   antes de mostrar el botón en algunos contextos.

3. **"Service must be completed before reviewing"** → servicio no está en status `completed`
   aún cuando el usuario intenta calificar.

4. **Zod validation fail** → algún campo mal tipado (número vs string).

### Fix

**Paso 1 — Mejorar error handling en `PostServiceModal`** para que el error real sea visible:

```ts
// ANTES (post-service-modal.tsx línea 66-89):
const submitReview = async () => {
  setLoading(true);
  try {
    ...
    const res = await fetch(endpoint, { ... });
    if (!res.ok) throw new Error();           // ← pierde el mensaje
    toast.success("¡Gracias por tu calificación!");
  } catch {
    toast.error("Error al enviar la calificación");  // ← genérico
  } finally { ... }
};

// DESPUÉS:
const submitReview = async () => {
  setLoading(true);
  try {
    ...
    const res = await fetch(endpoint, { ... });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Error ${res.status}`);
    }
    toast.success("¡Gracias por tu calificación!");
  } catch (err: any) {
    toast.error(err?.message || "Error al enviar la calificación");
  } finally { ... }
};
```

**Paso 2 — Mejorar error handling en `submitClientRating`** (mis-trabajos.tsx línea 552-568):

```ts
// ANTES:
} catch {
  toast.error("Error al enviar la calificación");
}

// DESPUÉS:
} catch (err: any) {
  const data = err?.response?.data || {};
  toast.error(data?.error || err?.message || "Error al enviar la calificación");
}
```

O si es un fetch directo (no axios), leer el body antes:
```ts
const res = await fetch("/api/reviews/rate-client", { ... });
if (!res.ok) {
  const data = await res.json().catch(() => ({}));
  toast.error(data?.error || "Error al enviar la calificación");
  return;
}
```

**Paso 3 (si el error persiste):** Con el mensaje real visible, corregir la causa específica.
Las más probables basado en el código:
- Si es "El profesional indicado no corresponde": verificar que `service.workerId` esté
  correctamente poblado en la respuesta de `GET /api/services/:id` y que `service.worker.id` coincida
- Si es duplicada: agregar check `if (service.reviewedByClient) return;` antes de abrir el modal

---

## Bug 4 — Pantalla de búsqueda no se refresca al aceptar un trabajador

### Descripción del usuario
> "Después de aceptar un trabajo, al volver al inicio sigue mostrando la pantalla
> 'no encontró a nadie / ¿Aún necesitas este servicio?' en vez de actualizar
> automáticamente. Requiere refresh manual."

### Archivo a modificar
`client/components/client-home.tsx`

### Causa raíz (confirmada en el código)

**`handleProposalAccepted` línea 1222** — NO invalida ninguna query de servicios:
```ts
const handleProposalAccepted = useCallback((proposal: any) => {
  setProposalsPanelOpen(false);
  setAllProposalsOpen(false);
  setChatProposal(proposal);
  // ← FALTA: queryClient.invalidateQueries(...)
}, []);
```

**`ProposalCard` líneas 681-697** — al aceptar, solo llama `onAccepted(proposal)`:
```ts
await acceptMutation.mutateAsync({ id: proposal.id });
onAccepted(proposal);  // → handleProposalAccepted → solo UI state, sin invalidar queries
```

El flujo después de aceptar:
1. El servidor mueve el servicio de `pending` → `in_progress`
2. El servidor emite socket events `proposal_updated` + `service_updated` (proposals.ts líneas 276-280)
3. `handleProposalUpdated` en client-home recibe el socket y llama `invalidateQueries(getListServicesQueryKey())` (línea 1065)
4. **PERO** el socket event puede llegar con demora, y mientras tanto:
   - `pendingServices` query ya no incluye el servicio (pasó a in_progress)
   - `inProgressServices` query aún no fue refetched
   - `selectedService` = undefined → `isServiceAccepted = false` → aparece "Buscar de nuevo"

### El estado "Buscar de nuevo" en detalle

La UI muestra "Buscar de nuevo" cuando `activeServiceId` existe pero `!isServiceAccepted`:
```ts
const isServiceAccepted = selectedService?.status === "accepted" || selectedService?.status === "in_progress";
// isServiceAccepted = false cuando selectedService está undefined (queries no actualizadas)
```

### Fix

**Opción A (recomendada):** Invalidar inmediatamente en `handleProposalAccepted`:

```ts
const handleProposalAccepted = useCallback((proposal: any) => {
  setProposalsPanelOpen(false);
  setAllProposalsOpen(false);
  setChatProposal(proposal);
  // Invalidar de inmediato sin esperar el socket event
  queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
}, [queryClient]);  // agregar queryClient a deps
```

**Opción B (más robusta):** También invalidar en el `onSuccess` del `acceptFromChatMutation`:

Buscar donde se define `acceptFromChatMutation` (cerca de `handleAcceptFromChat` línea 1236)
y agregar un callback `onSuccess` que invalide:

```ts
const acceptFromChatMutation = useAcceptProposal({
  mutation: {
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
    }
  }
});
```

**Verificar también** `ProposalCard` interno (línea 681): la función `acceptMutation` local
dentro del componente también puede agregar invalidación en su `onSuccess`. Pero la Opción A
es suficiente ya que `onAccepted` siempre se llama después del mutate exitoso.

---

## Resumen de cambios por archivo

| Archivo | Bug | Cambio |
|---|---|---|
| `client/components/proposal-chat-sheet.tsx` | Bug 1 | `staleTime: 0` + `refetchOnMount: 'always'` |
| `client/pages/services/detail.tsx` | Bug 2 | Agregar `readOnly={isServiceClosed}` al chat de chatProposalId |
| `client/pages/services/detail.tsx` | Bug 2 | Agregar socket listener para `service_updated` → invalidar query del servicio |
| `client/components/post-service-modal.tsx` | Bug 3 | Mejorar error handling para preservar mensaje del servidor |
| `client/pages/mis-trabajos.tsx` | Bug 3 | Mejorar error handling en `submitClientRating` |
| `client/components/client-home.tsx` | Bug 4 | Agregar `queryClient.invalidateQueries(getListServicesQueryKey())` en `handleProposalAccepted` |

---

## Reglas de negocio a respetar (NO violar)

- NO agregar campos de precio/monto a ninguna tabla
- NO implementar pagos entre usuarios
- NO guardar mensajes en texto plano (los mensajes son blobs cifrados E2E)
- NO mostrar "fechas de trabajo completado"
- NO registrar "trabajos completados" como métrica
- Lenguaje: "Conectar" (no "contratar"), "Conversación archivada" (no "trabajo completado")
- Color: azul `#1a8cf8`, NO amarillo

---

## Notas adicionales para el agente implementador

1. **Antes de tocar código:** Leer los archivos completos en las líneas indicadas para ver
   el contexto exacto. Los números de línea son aproximados (el archivo tiene 1572 líneas
   en detail.tsx y 1413 en proposal-chat-sheet.tsx).

2. **Bug 2 — socket en detail.tsx:** Verificar cómo se obtiene el socket en ese componente.
   Puede estar via `useSocket` hook o via `getSocket()`. Adaptarse al patrón ya usado.
   La key del query del servicio es `getGetServiceQueryKey(id)` (importada de `@/api`).

3. **Bug 3 — verificación adicional:** Después de mejorar el error handling, probar el flujo
   real. Si el error que aparece es "Ya calificaste este servicio", el fix adicional es
   ocultar el botón "Calificar" cuando `service.reviewedByClient === true`. Si es
   "El profesional no corresponde", hay un mismatch en los IDs que hay que rastrear.

4. **No cambiar la lógica de chat E2E:** El cifrado, las llaves, el merge de mensajes, y
   el decryption cache deben quedar intactos. Solo cambiar `staleTime` y `refetchOnMount`.

5. **Probar después de cada fix** arrancando la app con `pnpm dev` y verificando en el
   preview que el comportamiento correcto se cumple.
