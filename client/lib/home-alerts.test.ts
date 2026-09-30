import assert from "node:assert/strict";
import { getHomeAlertKey, selectCurrentHomeAlerts } from "./home-alerts";

const cancellationFlow = [
  { id: 101, relatedId: 42, createdAt: "2026-09-01T14:00:00.000Z", title: "Servicio cancelado" },
  { id: 102, relatedId: 42, createdAt: "2026-09-01T14:01:00.000Z", title: "Cargo de visita técnica" },
  { id: 103, relatedId: 42, createdAt: "2026-09-01T14:02:00.000Z", title: "Comprobante subido" },
  { id: 104, relatedId: 42, createdAt: "2026-09-01T14:03:00.000Z", title: "Pago confirmado" },
];

assert.deepEqual(
  selectCurrentHomeAlerts(cancellationFlow).map(alert => alert.id),
  [104],
  "un trabajo debe mostrar solo su estado más reciente",
);

assert.deepEqual(
  selectCurrentHomeAlerts([
    ...cancellationFlow.slice(0, 2),
    { id: 201, relatedId: 77, createdAt: "2026-09-01T14:01:30.000Z", title: "Otro trabajo" },
  ]).map(alert => alert.id),
  [201, 102],
  "trabajos distintos deben conservar una alerta cada uno",
);

assert.deepEqual(
  selectCurrentHomeAlerts([
    { id: 301, createdAt: "2026-09-01T14:00:00.000Z", title: "Aviso global 1" },
    { id: 302, createdAt: "2026-09-01T14:01:00.000Z", title: "Aviso global 2" },
  ]).map(alert => alert.id),
  [302, 301],
  "avisos sin trabajo relacionado no deben fusionarse",
);

assert.deepEqual(
  selectCurrentHomeAlerts([
    { id: 401, relatedId: 88, createdAt: "2026-09-01T14:00:00.000Z", title: "Anterior" },
    { id: 402, relatedId: 88, createdAt: "2026-09-01T14:00:00.000Z", title: "Desempate" },
  ]).map(alert => alert.id),
  [402],
  "el id mayor desempata fechas iguales",
);

assert.equal(getHomeAlertKey(cancellationFlow[0]), "service:42");
assert.equal(getHomeAlertKey({ id: 999 }), "notification:999");