import { db, servicesTable, usersTable, messagesTable } from "../db";
import { and, eq } from "drizzle-orm";
import { createNotification } from "./createNotification";
import { emitToService, emitToUser } from "./socketio";
import { logger } from "./logger";
import { removeE2EChatAttachments } from "./chat-attachments";

type ServiceRow = typeof servicesTable.$inferSelect;

/**
 * Finaliza un servicio ya marcado como "completed" (el UPDATE condicional lo
 * hace quien llama; aquí van solo los side effects compartidos):
 * - notificaciones a ambas partes
 * - mensaje de sistema en el chat
 * - si el pago es por TRANSFERENCIA: inyecta automáticamente los datos
 *   bancarios oficiales del experto en el chat, para que el cliente transfiera
 *   sin que nadie comparta datos por fuera de la app (política de seguridad).
 *   IMPORTANTE (legal): Fixgo NO procesa el pago — solo muestra los datos.
 * - emits de service_updated
 */
export async function finalizeCompletionSideEffects(
  service: ServiceRow,
  completionNote: string,
): Promise<void> {
  // La copia de participantes desaparece al cerrar; la copia de soporte se
  // conserva hasta que termine la ventana de reclamo.
  await removeE2EChatAttachments(service.id);
  await createNotification({
    userId: service.clientId,
    title: "Trabajo completado",
    message: `"${service.title}" quedó completado. ¡Ya puedes calificar la experiencia!`,
    type: "service_completed",
    relatedId: service.id,
    targetRole: "client",
  });

  if (service.workerId) {
    await createNotification({
      userId: service.workerId,
      title: "Trabajo completado",
      message: `"${service.title}" quedó completado. ¡Ya puedes calificar al cliente!`,
      type: "service_completed",
      relatedId: service.id,
      targetRole: "worker",
    });

    // Mensaje de sistema con el cierre. Regla del hilo: todo insert lleva workerId.
    const [sysMsg] = await db.insert(messagesTable).values({
      serviceId: service.id,
      senderId: service.workerId,
      workerId: service.workerId,
      content: `✅ ${completionNote} ¡Ya pueden calificar la experiencia!`,
      messageType: "system",
    }).returning();
    const sysFullMsg = { ...sysMsg, sender: null };
    emitToService(service.id, "new_message", sysFullMsg);
    emitToUser(service.clientId, "new_message", sysFullMsg);
    emitToUser(service.workerId, "new_message", sysFullMsg);

    // Pago por transferencia → inyectar datos bancarios oficiales del experto.
    if (service.paymentMethod === "transfer") {
      try {
        const [worker] = await db.select({
          name: usersTable.name,
          payoutBankName: usersTable.payoutBankName,
          payoutBankAccountType: usersTable.payoutBankAccountType,
          payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
          payoutBankRut: usersTable.payoutBankRut,
        }).from(usersTable).where(eq(usersTable.id, service.workerId)).limit(1);

        if (
          worker?.payoutBankName && worker.payoutBankAccountType &&
          worker.payoutBankAccountNumber && worker.payoutBankRut
        ) {
          // El mensaje persistido solo contiene un marcador. Los datos
          // bancarios se solicitan después desde el chat autorizado del cliente
          // y nunca quedan expuestos dentro del historial del mensaje.
          const content = "__TRANSFER_CARD__";

          // La transición del servicio es atómica, pero una respuesta perdida
          // puede provocar que el cliente reintente la operación después de que
          // el estado ya cambió. No insertar otro marcador en ese caso.
          const [existingBankMsg] = await db.select()
            .from(messagesTable)
            .where(and(
              eq(messagesTable.serviceId, service.id),
              eq(messagesTable.messageType, "transfer_card"),
            ))
            .limit(1);
          const [bankMsg] = existingBankMsg
            ? [existingBankMsg]
            : await db.insert(messagesTable).values({
                serviceId: service.id,
                senderId: service.workerId,
                workerId: service.workerId,
                content,
                messageType: "transfer_card",
              }).returning();
          const bankFullMsg = { ...bankMsg, sender: null };
          emitToService(service.id, "new_message", bankFullMsg);
          emitToUser(service.clientId, "new_message", bankFullMsg);
          emitToUser(service.workerId, "new_message", bankFullMsg);

          if (!existingBankMsg) {
            await createNotification({
              userId: service.clientId,
              title: "Datos de transferencia disponibles 💳",
              message: `El trabajo se ha completado. Ya puedes revisar los datos bancarios en el chat para proceder con el pago.`,
              type: "payment",
              relatedId: service.id,
              targetRole: "client",
              highPriority: true,
            });
          }
        } else {
          logger.warn({ serviceId: service.id, workerId: service.workerId }, "Servicio por transferencia completado pero el experto no tiene datos bancarios completos");
        }
      } catch (err) {
        logger.error({ err, serviceId: service.id }, "Error inyectando datos de transferencia");
      }
    }
  }

  emitToService(service.id, "service_updated", { serviceId: service.id, status: "completed" });
  emitToUser(service.clientId, "service_updated", { serviceId: service.id, status: "completed" });
  if (service.workerId) emitToUser(service.workerId, "service_updated", { serviceId: service.id, status: "completed" });
}
