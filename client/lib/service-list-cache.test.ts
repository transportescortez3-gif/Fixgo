import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { removeCancelledServiceFromHomeLists } from "./service-list-cache";

async function main() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cancelled = { id: 42, status: "pending", title: "Cancelado" };
  const other = { id: 43, status: "pending", title: "Sigue activo" };
  const activeKeys = [
    ["/api/services", { status: "pending", limit: 5 }],
    ["/api/services", { status: "alerting", limit: 1 }],
    ["/api/services", { status: "open", limit: 1 }],
    ["/api/services", { status: "accepted", limit: 1 }],
    ["/api/services", { status: "in_progress", limit: 1 }],
  ] as const;

  client.setQueryData(["/api/services/42"], cancelled);
  for (const key of activeKeys) {
    client.setQueryData(key, {
      services: [cancelled, other],
      total: 2,
      page: 1,
      limit: key[1].limit,
    });
  }
  const historyKey = ["/api/services", { status: "completed", limit: 20 }] as const;
  client.setQueryData(historyKey, { services: [cancelled, other], total: 2, page: 1, limit: 20 });

  await removeCancelledServiceFromHomeLists(client, 42);

  assert.equal(client.getQueryData<any>(["/api/services/42"])?.status, "cancelled");
  for (const key of activeKeys) {
    assert.deepEqual(client.getQueryData<any>(key)?.services.map((service: any) => service.id), [43]);
    assert.equal(client.getQueryData<any>(key)?.total, 1);
  }
  assert.deepEqual(client.getQueryData<any>(historyKey)?.services.map((service: any) => service.id), [42, 43]);

  const rawList = [{ id: 42 }, { id: 43 }];
  client.setQueryData(["/api/services", { status: "pending", limit: 5 }], rawList);
  await removeCancelledServiceFromHomeLists(client, 42);
  assert.deepEqual(
    client.getQueryData<any>(activeKeys[0])?.map((service: any) => service.id),
    [43],
  );

  client.clear();
  console.log("service-list-cache: cancelled request cleanup passed");
}

void main();
