import type { QueryClient } from "@tanstack/react-query";

const HOME_ACTIVE_LISTS = [
  { status: "pending", limit: 5 },
  { status: "alerting", limit: 1 },
  { status: "open", limit: 1 },
  { status: "accepted", limit: 1 },
  { status: "in_progress", limit: 1 },
] as const;

function removeService(data: any, serviceId: number): any {
  if (Array.isArray(data)) {
    return data.filter(service => service?.id !== serviceId);
  }
  if (!data || !Array.isArray(data.services)) return data;

  const services = data.services.filter((service: any) => service?.id !== serviceId);
  const removedCount = data.services.length - services.length;
  if (removedCount === 0) return data;

  return {
    ...data,
    services,
    ...(typeof data.total === "number"
      ? { total: Math.max(0, data.total - removedCount) }
      : {}),
  };
}

/**
 * Immediately removes a cancelled request from the persistent Home's active
 * list caches. This prevents stale React Query results from keeping its radar
 * and proposal UI mounted while the server refetch is in flight.
 */
export async function removeCancelledServiceFromHomeLists(
  client: QueryClient,
  serviceId: number,
): Promise<void> {
  await client.cancelQueries({ queryKey: ["/api/services"] });

  client.setQueryData<any>([`/api/services/${serviceId}`], (current: any) =>
    current ? { ...current, status: "cancelled" } : current,
  );

  for (const params of HOME_ACTIVE_LISTS) {
    client.setQueryData<any>(["/api/services", params], (current: any) =>
      removeService(current, serviceId),
    );
  }
}
