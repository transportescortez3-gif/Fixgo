import { Router } from "express";
import { db, alertSessionsTable, servicesTable } from "../db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import {
  handleWorkerSkip,
  handleWorkerView,
  reconcileWorkerAlertState,
  releaseWorkerAlertSlot,
} from "../lib/service-motor";

const router = Router();

router.post("/alert-sessions/reconcile", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden reconciliar sus alertas" });
    return;
  }

  const rawActiveServiceId = req.query.activeServiceId;
  let activeServiceId: number | null = null;
  if (rawActiveServiceId !== undefined) {
    if (typeof rawActiveServiceId !== "string" || !/^[1-9]\d*$/.test(rawActiveServiceId)) {
      res.status(400).json({ error: "ID de servicio activo inválido" });
      return;
    }
    activeServiceId = Number(rawActiveServiceId);
    if (!Number.isSafeInteger(activeServiceId)) {
      res.status(400).json({ error: "ID de servicio activo inválido" });
      return;
    }
  }

  await reconcileWorkerAlertState(req.userId!, activeServiceId);
  res.json({ ok: true });
});

router.patch("/alert-sessions/:serviceId/skip", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden omitir alertas" });
    return;
  }

  const serviceId = parseInt(String(req.params.serviceId), 10);

  const [session] = await db.select()
    .from(alertSessionsTable)
    .where(and(
      eq(alertSessionsTable.serviceId, serviceId),
      eq(alertSessionsTable.workerId, req.userId!),
    ))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Sesión de alerta no encontrada" });
    return;
  }

  await handleWorkerSkip(serviceId, req.userId!);
  res.json({ ok: true });
});

router.patch("/alert-sessions/:serviceId/view", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden confirmar vista de alerta" });
    return;
  }

  const serviceId = parseInt(String(req.params.serviceId), 10);

  const [service] = await db.select({ id: servicesTable.id, status: servicesTable.status })
    .from(servicesTable)
    .where(eq(servicesTable.id, serviceId))
    .limit(1);

  if (!service) {
    res.status(404).json({ error: "Servicio no encontrado" });
    return;
  }

  if (service.status !== "alerting" && service.status !== "open" && service.status !== "pending") {
    res.status(400).json({ error: "Este servicio ya no está disponible" });
    return;
  }

  const accepted = await handleWorkerView(serviceId, req.userId!);
  if (!accepted) {
    res.status(409).json({ error: "No puedes abrir esta solicitud mientras estás ocupado o no disponible" });
    return;
  }
  res.json({ ok: true });
});

router.patch("/alert-sessions/:serviceId/release", authenticate, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "worker") {
    res.status(403).json({ error: "Solo expertos pueden liberar una alerta" });
    return;
  }
  const serviceId = parseInt(String(req.params.serviceId), 10);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    res.status(400).json({ error: "ID de servicio inválido" });
    return;
  }

  await releaseWorkerAlertSlot(req.userId!, serviceId);
  res.json({ ok: true });
});

export default router;
