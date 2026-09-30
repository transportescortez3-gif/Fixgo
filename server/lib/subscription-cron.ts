import { db, userSubscriptionsTable, usersTable, subscriptionPlansTable, servicesTable, proposalsTable } from "../db";
import { runMotorMinuteLoop } from "./service-motor";
import { eq, and, sql, lte, gte, inArray } from "drizzle-orm";
import { createNotification } from "./createNotification";
import { emailService } from "./email";
import { logger } from "./logger";
import { emitToUser } from "./socketio";
import { purgeExpiredSecuritySelfies } from "./security-selfies";
import { purgeExpiredChatAttachmentSupportCopies, purgeOrphanedChatAttachments, removeE2EChatAttachments } from "./chat-attachments";

// Intervalo de revisión: cada 6 horas
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Deduplicación en memoria:
//   pushSent  — clave por bloque de 6h (una push por ejecución de cron)
//   emailSent — clave por día calendario (máximo un email por día)
// Se limpian al reiniciar el servidor, lo cual es aceptable porque las
// notificaciones no son críticas.
const pushSent  = new Set<string>();
const emailSent = new Set<string>();

function pushKey(subId: number, now: Date) {
  const block = Math.floor(now.getTime() / (6 * 3600 * 1000));
  return `push-${subId}-${block}`;
}
function emailKey(subId: number, now: Date) {
  const day = now.toISOString().slice(0, 10);
  return `email-${subId}-${day}`;
}

async function checkExpiringSubscriptions() {
  try {
    const now = new Date();

    // Buscar todas las suscripciones que vencen dentro de los próximos 7 días.
    // El cron corre cada 6h → push cada 6h, email máximo 1 por día.
    const in7days = new Date(now.getTime() + 7 * 86400000);

    const expiring = await db
      .select({
        sub:       userSubscriptionsTable,
        userName:  usersTable.name,
        userEmail: usersTable.email,
      })
      .from(userSubscriptionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userSubscriptionsTable.userId))
      .where(
        and(
          sql`${userSubscriptionsTable.status} IN ('active','trialing')`,
          gte(userSubscriptionsTable.currentPeriodEnd, now),
          lte(userSubscriptionsTable.currentPeriodEnd, in7days)
        )
      );

    for (const row of expiring) {
      const msLeft  = row.sub.currentPeriodEnd.getTime() - now.getTime();
      const daysLeft = Math.max(1, Math.ceil(msLeft / 86400000));
      const isTrial  = row.sub.status === "trialing";

      const title = isTrial
        ? `Tu período de prueba vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`
        : `Tu suscripción vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`;
      const message = isTrial
        ? "Activa un plan para seguir recibiendo leads sin interrupciones."
        : "Renueva tu suscripción para mantener el acceso completo a Fixgo.";

      // Push in-app: una vez por bloque de 6h (= cada ejecución del cron)
      const pk = pushKey(row.sub.id, now);
      if (!pushSent.has(pk)) {
        pushSent.add(pk);
        await createNotification({
          userId:    row.sub.userId,
          type:      "subscription_expiry",
          title,
          message,
          relatedId: row.sub.id,
        });
        logger.info(
          { userId: row.sub.userId, subId: row.sub.id, daysLeft },
          "Subscription expiry push sent"
        );
      }

      // Email: máximo uno por día calendario
      const ek = emailKey(row.sub.id, now);
      if (!emailSent.has(ek)) {
        emailSent.add(ek);

        const [planRow] = await db
          .select({ name: subscriptionPlansTable.name })
          .from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.code, row.sub.planCode))
          .limit(1);

        const planName = planRow?.name ?? row.sub.planCode;

        emailService
          .sendSubscriptionExpiry(row.userEmail, row.userName, planName, daysLeft, isTrial)
          .catch(() => {});

        logger.info(
          { userId: row.sub.userId, subId: row.sub.id, daysLeft, email: row.userEmail },
          "Subscription expiry email sent"
        );
      }
    }

    // Convertir el trial gratuito en el plan gratuito del rol al vencer.
    // Primero capturamos los userIds para poder emitir socket events tras el update.
    const expiredTrials = await db
      .select({
        id: userSubscriptionsTable.id,
        userId: userSubscriptionsTable.userId,
        role: usersTable.role,
      })
      .from(userSubscriptionsTable)
      .innerJoin(usersTable, eq(usersTable.id, userSubscriptionsTable.userId))
      .where(and(
        eq(userSubscriptionsTable.status, "trialing"),
        lte(userSubscriptionsTable.currentPeriodEnd, now),
        sql`${userSubscriptionsTable.planCode} IN ('client_premium_monthly','pro_plus_monthly')`,
      ));

    for (const row of expiredTrials) {
      const newPeriodStart = new Date();
      const newPeriodEnd = new Date();
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
      const freePlanCode = row.role === "worker" ? "pro_free" : "client_free";
      await db
        .update(userSubscriptionsTable)
        .set({
          planCode: freePlanCode,
          status: "active",
          interval: "monthly",
          pricePaidClp: 0,
          trialEndsAt: null,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          updatedAt: new Date(),
        })
        .where(eq(userSubscriptionsTable.id, row.id));
      try {
        emitToUser(row.userId, "subscription_updated", {
          status: "active",
          planCode: freePlanCode,
          subscriptionId: row.id,
        });
      } catch {}
    }

    // Marcar como expired las suscripciones pagadas vencidas (excepto planes gratuitos)
    const aboutToExpire = await db
      .select({ id: userSubscriptionsTable.id, userId: userSubscriptionsTable.userId })
      .from(userSubscriptionsTable)
      .where(
        and(
          sql`${userSubscriptionsTable.status} IN ('active','cancelled')`,
          lte(userSubscriptionsTable.currentPeriodEnd, now),
          sql`${userSubscriptionsTable.planCode} NOT IN ('client_free','pro_free')`
        )
      );

    await db
      .update(userSubscriptionsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          sql`${userSubscriptionsTable.status} IN ('active','cancelled')`,
          lte(userSubscriptionsTable.currentPeriodEnd, now),
          sql`${userSubscriptionsTable.planCode} NOT IN ('client_free','pro_free')`
        )
      );

    // Aviso en tiempo real para degradar la UI (quitar badge Pro, mostrar CTA renovar).
    for (const row of aboutToExpire) {
      try { emitToUser(row.userId, "subscription_updated", { status: "expired", subscriptionId: row.id }); } catch {}
    }

  } catch (err) {
    logger.error({ err }, "subscription-cron error");
  }
}

// Días sin propuestas para auto-cancelar un servicio pendiente
const STALE_PENDING_DAYS = 7;

async function cancelStalePendingServices() {
  try {
    const cutoff = new Date(Date.now() - STALE_PENDING_DAYS * 86400000);

    const stalePending = await db
      .select({ id: servicesTable.id, clientId: servicesTable.clientId, title: servicesTable.title })
      .from(servicesTable)
      .where(and(
        eq(servicesTable.status, "pending"),
        lte(servicesTable.createdAt, cutoff)
      ));

    // Batch: obtener en una sola query todos los serviceIds que ya tienen al menos una propuesta
    const staleIds = stalePending.map(s => s.id);
    const proposalRows = staleIds.length > 0
      ? await db.select({ serviceId: proposalsTable.serviceId })
          .from(proposalsTable)
          .where(inArray(proposalsTable.serviceId, staleIds))
      : [];
    const idsWithProposals = new Set(proposalRows.map(p => p.serviceId));

    for (const svc of stalePending) {
      if (idsWithProposals.has(svc.id)) continue;

      await db.update(servicesTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(servicesTable.id, svc.id), eq(servicesTable.status, "pending")));
      await removeE2EChatAttachments(svc.id);

      await createNotification({
        userId: svc.clientId,
        title: "Solicitud cancelada automáticamente",
        message: `Tu solicitud "${svc.title}" fue cancelada por no recibir propuestas en ${STALE_PENDING_DAYS} días.`,
        type: "service_request",
        relatedId: svc.id,
      });

      logger.info({ serviceId: svc.id, clientId: svc.clientId }, "Stale pending service auto-cancelled (no proposals)");
    }

    if (stalePending.length > 0) {
      logger.info({ checked: stalePending.length }, "Stale pending services check complete");
    }
  } catch (err) {
    logger.error({ err }, "cancelStalePendingServices error");
  }
}

async function runAllCronJobs() {
  await checkExpiringSubscriptions();
  await cancelStalePendingServices();
  await purgeExpiredSecuritySelfies();
  await purgeExpiredChatAttachmentSupportCopies();
  await purgeOrphanedChatAttachments();
}

let cronTimer: ReturnType<typeof setInterval> | null = null;
let motorTimer: ReturnType<typeof setInterval> | null = null;

export function startSubscriptionCron() {
  if (cronTimer) return;
  setTimeout(runAllCronJobs, 30_000);
  cronTimer = setInterval(runAllCronJobs, CHECK_INTERVAL_MS);
  logger.info("Subscription cron started (interval: 6h)");

  // Motor de Solicitudes: bucle del minuto cada 30s
  motorTimer = setInterval(() => {
    runMotorMinuteLoop().catch(e => logger.error({ err: e }, "motor minute loop error"));
  }, 30_000);
  logger.info("Service motor minute loop started (interval: 30s)");
}

export function stopSubscriptionCron() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
  if (motorTimer) {
    clearInterval(motorTimer);
    motorTimer = null;
  }
}
