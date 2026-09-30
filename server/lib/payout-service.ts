import { logger } from "./logger";

export interface PayoutParams {
  paymentId: number;
  workerId: number;
  amount: number;
  serviceId: number;
}

/**
 * Fixgo ya no procesa pagos entre usuarios (modelo SaaS/Licencia).
 * Los pagos entre cliente y profesional se realizan directamente fuera de la app.
 * Esta función es un stub que no hace nada.
 */
export async function triggerWorkerPayout(params: PayoutParams): Promise<void> {
  logger.info({ ...params }, "triggerWorkerPayout: no-op (modelo SaaS — pagos directos entre usuarios)");
}
