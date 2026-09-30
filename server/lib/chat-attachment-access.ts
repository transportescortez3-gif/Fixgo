export const PENDING_SERVICE_STATUSES: readonly string[] = ["pending", "alerting", "open"];

export type AttachmentAccessService = {
  clientId: number;
  workerId: number | null;
  status: string | null;
};

export type AttachmentAccessError = {
  status: number;
  error: string;
};

/**
 * Checks the service-level authorization shared by every attachment phase.
 * Thread-specific checks (proposal existence and workerId matching) remain in
 * the route because they require database access.
 */
export function attachmentAccessError(
  service: AttachmentAccessService | undefined,
  userId: number,
  userRole?: string,
): AttachmentAccessError | null {
  if (!service) {
    return { status: 404, error: "Conversación no encontrada" };
  }
  if (["cancelled", "completed"].includes(service.status ?? "")) {
    return { status: 409, error: "El servicio está cerrado" };
  }
  const isPending = PENDING_SERVICE_STATUSES.includes(service.status ?? "");
  if (!isPending && service.clientId !== userId && service.workerId !== userId) {
    return { status: 403, error: "No tienes acceso a este chat" };
  }
  if (isPending && service.clientId !== userId && userRole !== "worker") {
    return { status: 403, error: "No tienes acceso a este chat" };
  }
  return null;
}