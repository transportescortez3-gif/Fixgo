import { Router } from "express";
import { eq, and, desc, sql, inArray, lte } from "drizzle-orm";
import { db, subscriptionPlansTable, userSubscriptionsTable, subscriptionPaymentsTable, couponsTable, couponUsesTable, usersTable } from "../db";
import { authenticate } from "../middlewares/authenticate";
import type { AuthRequest } from "../middlewares/authenticate";
import { webpayCreate, webpayCommit } from "../lib/transbank";
import { logger } from "../lib/logger";
import { emitToUser } from "../lib/socketio";

const router = Router();

const APP_URL = process.env.APP_URL || "https://appfixgo.com";
const PENDING_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

// ─── UTILIDADES ──────────────────────────────────────────────────────────────

function periodEnd(interval: "monthly" | "annual"): Date {
  const d = new Date();
  if (interval === "annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function buyOrder(userId: number): string {
  return `FXR-${userId}-${Date.now()}`;
}

async function cancelPendingAttempt(paymentId: number, userId?: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const paymentConditions = [
      eq(subscriptionPaymentsTable.id, paymentId),
      eq(subscriptionPaymentsTable.status, "pending"),
    ];
    if (userId !== undefined) paymentConditions.push(eq(subscriptionPaymentsTable.userId, userId));

    const [payment] = await tx
      .update(subscriptionPaymentsTable)
      .set({ status: "cancelled" })
      .where(and(...paymentConditions))
      .returning({
        id: subscriptionPaymentsTable.id,
        subscriptionId: subscriptionPaymentsTable.subscriptionId,
      });

    if (!payment) return false;

    await tx
      .update(userSubscriptionsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(userSubscriptionsTable.id, payment.subscriptionId),
        eq(userSubscriptionsTable.status, "past_due"),
      ));

    return true;
  });
}

async function cancelStalePendingAttempts(userId: number): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MS);

  await db.transaction(async (tx) => {
    const stalePayments = await tx
      .select({
        id: subscriptionPaymentsTable.id,
        subscriptionId: subscriptionPaymentsTable.subscriptionId,
      })
      .from(subscriptionPaymentsTable)
      .where(and(
        eq(subscriptionPaymentsTable.userId, userId),
        eq(subscriptionPaymentsTable.status, "pending"),
        lte(subscriptionPaymentsTable.createdAt, cutoff),
      ));

    if (stalePayments.length === 0) return;

    const paymentIds = stalePayments.map((payment) => payment.id);
    const subscriptionIds = stalePayments.map((payment) => payment.subscriptionId);
    await tx
      .update(subscriptionPaymentsTable)
      .set({ status: "cancelled" })
      .where(inArray(subscriptionPaymentsTable.id, paymentIds));
    await tx
      .update(userSubscriptionsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(
        inArray(userSubscriptionsTable.id, subscriptionIds),
        eq(userSubscriptionsTable.status, "past_due"),
      ));
  });
}

// ─── GET /api/subscriptions/plans ────────────────────────────────────────────
// Retorna todos los planes activos (público, sin auth)
router.get("/subscriptions/plans", async (_req, res): Promise<void> => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder);
    res.json(plans);
  } catch (err) {
    logger.error(err, "subscriptions/plans error");
    res.status(500).json({ error: "Error al obtener planes" });
  }
});

// ─── GET /api/subscriptions/me ───────────────────────────────────────────────
// Retorna la suscripción activa del usuario autenticado
router.get("/subscriptions/me", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    await cancelStalePendingAttempts(userId);
    const rows = await db
      .select()
      .from(userSubscriptionsTable)
      .where(
        and(
          eq(userSubscriptionsTable.userId, userId),
          sql`status IN ('active','trialing')`
        )
      )
      .orderBy(desc(userSubscriptionsTable.createdAt))
      .limit(1);

    if (rows.length === 0) {
      // Fallback para cuentas antiguas creadas antes del trial automático.
      try {
        const userRows = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        const role = userRows[0]?.role ?? "client";
        const planCode = role === "worker" ? "pro_free" : "client_free";
        const freePlanRows = await db.select().from(subscriptionPlansTable).where(and(eq(subscriptionPlansTable.code, planCode), eq(subscriptionPlansTable.isActive, true))).limit(1);
        if (freePlanRows.length > 0) {
          const periodStart = new Date();
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          const [newSub] = await db.insert(userSubscriptionsTable).values({
            userId,
            planCode,
            status: "active",
            interval: "monthly",
            pricePaidClp: 0,
            trialEndsAt: null,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          }).returning();
          res.json({ subscription: newSub, plan: freePlanRows[0] });
          return;
        }
      } catch (trialErr) {
        logger.warn(trialErr, "No se pudo crear trial automático");
      }
      res.json({ subscription: null });
      return;
    }

    const sub = rows[0];
    const FREE_PLANS = ["client_free", "pro_free"];
    const TRIAL_PLANS = ["client_premium_monthly", "pro_plus_monthly"];
    const isFreePlan = FREE_PLANS.includes(sub.planCode);

    // Si el período venció, renovar planes gratuitos o expirar planes de pago
    const trialExpired = sub.status === "trialing" && sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date();
    const periodExpired = sub.status !== "trialing" && new Date(sub.currentPeriodEnd) < new Date();
    if (trialExpired || periodExpired) {
      if (isFreePlan) {
        // Plan gratuito: auto-renovar por 1 mes más en vez de expirar
        const newPeriodStart = new Date();
        const newPeriodEnd = new Date();
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        await db
          .update(userSubscriptionsTable)
          .set({ status: "active", currentPeriodStart: newPeriodStart, currentPeriodEnd: newPeriodEnd, trialEndsAt: null, updatedAt: new Date() })
          .where(eq(userSubscriptionsTable.id, sub.id));
        sub.status = "active";
        (sub as any).currentPeriodStart = newPeriodStart;
        (sub as any).currentPeriodEnd = newPeriodEnd;
        (sub as any).trialEndsAt = null;
      } else if (sub.status === "trialing" && TRIAL_PLANS.includes(sub.planCode)) {
        const userRows = await db
          .select({ role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const freePlanCode = userRows[0]?.role === "worker" ? "pro_free" : "client_free";
        const newPeriodStart = new Date();
        const newPeriodEnd = new Date();
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
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
          .where(eq(userSubscriptionsTable.id, sub.id));
        sub.planCode = freePlanCode;
        sub.status = "active";
        (sub as any).interval = "monthly";
        (sub as any).pricePaidClp = 0;
        (sub as any).trialEndsAt = null;
        (sub as any).currentPeriodStart = newPeriodStart;
        (sub as any).currentPeriodEnd = newPeriodEnd;
      } else {
        await db
          .update(userSubscriptionsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(userSubscriptionsTable.id, sub.id));
        sub.status = "expired";
      }
    }

    // Info del plan
    const planRows = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.code, sub.planCode))
      .limit(1);

    res.json({ subscription: sub, plan: planRows[0] ?? null });
  } catch (err) {
    logger.error(err, "subscriptions/me error");
    res.status(500).json({ error: "Error al obtener suscripción" });
  }
});

// ─── POST /api/subscriptions/validate-coupon ─────────────────────────────────
router.post("/subscriptions/validate-coupon", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { code, planCode, interval } = req.body as { code: string; planCode: string; interval: string };
    const userId = req.userId!;

    if (!code || !planCode || !interval) {
      res.status(400).json({ error: "Faltan parámetros" });
      return;
    }

    const couponRows = await db
      .select()
      .from(couponsTable)
      .where(and(eq(couponsTable.code, code.toUpperCase()), eq(couponsTable.isActive, true)))
      .limit(1);

    if (couponRows.length === 0) {
      res.status(404).json({ error: "Cupón no válido" });
      return;
    }

    const coupon = couponRows[0];

    // Expirado
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ error: "El cupón ha expirado" });
      return;
    }

    // Usos máximos
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: "El cupón ya no tiene usos disponibles" });
      return;
    }

    // Ya lo usó este usuario
    const used = await db
      .select()
      .from(couponUsesTable)
      .where(and(eq(couponUsesTable.couponId, coupon.id), eq(couponUsesTable.userId, userId)))
      .limit(1);
    if (used.length > 0) {
      res.status(400).json({ error: "Ya usaste este cupón anteriormente" });
      return;
    }

    // Planes válidos
    if (coupon.validPlans && coupon.validPlans.length > 0 && !coupon.validPlans.includes(planCode)) {
      res.status(400).json({ error: "Este cupón no aplica para el plan seleccionado" });
      return;
    }

    // Intervalos válidos
    if (coupon.validIntervals && coupon.validIntervals.length > 0 && !coupon.validIntervals.includes(interval)) {
      res.status(400).json({ error: "Este cupón no aplica para el período seleccionado" });
      return;
    }

    // Obtener precio del plan
    const planRows = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.code, planCode))
      .limit(1);

    if (planRows.length === 0) {
      res.status(404).json({ error: "Plan no encontrado" });
      return;
    }

    const plan = planRows[0];
    let discountClp = 0;
    if (coupon.discountType === "percent") {
      discountClp = Math.round(plan.priceClp * coupon.discountValue / 100);
    } else {
      discountClp = Math.min(coupon.discountValue, plan.priceClp);
    }

    const finalPrice = Math.max(0, plan.priceClp - discountClp);

    res.json({
      valid: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountClp,
        finalPrice,
      },
    });
  } catch (err) {
    logger.error(err, "validate-coupon error");
    res.status(500).json({ error: "Error al validar cupón" });
  }
});

// ─── POST /api/subscriptions/checkout ────────────────────────────────────────
// Inicia el pago Webpay Plus para una suscripción
router.post("/subscriptions/checkout", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const { planCode, interval, couponCode } = req.body as { planCode: string; interval: "monthly" | "annual"; couponCode?: string };
    const userId = req.userId!;

    // Validar plan
    const planRows = await db
      .select()
      .from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.code, planCode), eq(subscriptionPlansTable.isActive, true)))
      .limit(1);

    if (planRows.length === 0) {
      res.status(404).json({ error: "Plan no encontrado" });
      return;
    }

    const plan = planRows[0];

    // Plan gratuito → activar directo sin pago
    if (plan.priceClp === 0) {
      const periodEndDate = periodEnd(interval);
      const [sub] = await db
        .insert(userSubscriptionsTable)
        .values({
          userId,
          planCode,
          status: "active",
          interval,
          pricePaidClp: 0,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEndDate,
        })
        .returning();
      res.json({ free: true, subscription: sub });
      return;
    }

    // Calcular descuento si hay cupón
    let discountClp = 0;
    let validatedCoupon: any = null;
    if (couponCode) {
      const couponRows = await db
        .select()
        .from(couponsTable)
        .where(and(eq(couponsTable.code, couponCode.toUpperCase()), eq(couponsTable.isActive, true)))
        .limit(1);

      if (couponRows.length > 0) {
        const coupon = couponRows[0];
        if (coupon.discountType === "percent") {
          discountClp = Math.round(plan.priceClp * coupon.discountValue / 100);
        } else {
          discountClp = Math.min(coupon.discountValue, plan.priceClp);
        }
        validatedCoupon = coupon;
      }
    }

    const finalAmount = Math.max(1, plan.priceClp - discountClp);
    const periodEndDate = periodEnd(interval);
    const order = buyOrder(userId);
    const sessionId = `FXR-SESSION-${userId}-${Date.now()}`;

    // Crear registro de suscripción pendiente
    const [sub] = await db
      .insert(userSubscriptionsTable)
      .values({
        userId,
        planCode,
        status: "past_due",
        interval,
        pricePaidClp: finalAmount,
        couponCode: validatedCoupon?.code ?? null,
        discountClp,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEndDate,
      })
      .returning();

    // Crear registro de pago pendiente
    const [payment] = await db
      .insert(subscriptionPaymentsTable)
      .values({
        subscriptionId: sub.id,
        userId,
        amountClp: finalAmount,
        tbkBuyOrder: order,
        tbkSessionId: sessionId,
        status: "pending",
        periodStart: new Date(),
        periodEnd: periodEndDate,
      })
      .returning();

    // Iniciar transacción Webpay Plus
    const returnUrl = `${APP_URL}/api/subscriptions/confirm?paymentId=${payment.id}`;
    const tbk = await webpayCreate(order, sessionId, finalAmount, returnUrl);

    // Guardar token Webpay
    await db
      .update(subscriptionPaymentsTable)
      .set({ tbkToken: tbk.token })
      .where(eq(subscriptionPaymentsTable.id, payment.id));

    res.json({
      url: tbk.url,
      token: tbk.token,
      paymentId: payment.id,
      subscriptionId: sub.id,
    });
  } catch (err) {
    logger.error(err, "subscriptions/checkout error");
    res.status(500).json({ error: "Error al iniciar el pago" });
  }
});

// ─── GET /api/subscriptions/confirm ─────────────────────────────────────────
// Webpay redirige aquí tras el pago (GET con token_ws en query)
router.get("/subscriptions/confirm", async (req, res): Promise<void> => {
  const token = req.query.token_ws as string | undefined;
  const cancelledToken = req.query.TBK_TOKEN as string | undefined;
  const paymentId = parseInt(req.query.paymentId as string);

  if ((cancelledToken || !token) && paymentId) {
    await cancelPendingAttempt(paymentId);
    res.redirect(`${APP_URL}/mi-plan?status=cancelled`);
    return;
  }

  if (!token || !paymentId) {
    res.redirect(`${APP_URL}/mi-plan?status=error&reason=no_token`);
    return;
  }

  try {
    const result = await webpayCommit(token);

    const paymentRows = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.id, paymentId))
      .limit(1);

    if (paymentRows.length === 0) {
      res.redirect(`${APP_URL}/mi-plan?status=error&reason=not_found`);
      return;
    }

    const payment = paymentRows[0];

    if (result.responseCode !== 0) {
      // Pago rechazado
      await db
        .update(subscriptionPaymentsTable)
        .set({ status: "rejected", tbkAuthCode: result.authorizationCode })
        .where(eq(subscriptionPaymentsTable.id, paymentId));

      await db
        .update(userSubscriptionsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(userSubscriptionsTable.id, payment.subscriptionId));

      res.redirect(`${APP_URL}/mi-plan?status=rejected`);
      return;
    }

    // Pago aprobado
    await db
      .update(subscriptionPaymentsTable)
      .set({
        status: "paid",
        tbkAuthCode: result.authorizationCode,
        tbkCardNumber: result.cardNumber,
        paidAt: new Date(),
      })
      .where(eq(subscriptionPaymentsTable.id, paymentId));

    await db
      .update(userSubscriptionsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(userSubscriptionsTable.id, payment.subscriptionId));

    // Avisa al cliente en tiempo real para que la pantalla "Mi Plan" se refresque.
    try { emitToUser(payment.userId, "subscription_updated", { status: "active", subscriptionId: payment.subscriptionId }); } catch {}

    // Marcar uso del cupón si había
    const [sub] = await db
      .select()
      .from(userSubscriptionsTable)
      .where(eq(userSubscriptionsTable.id, payment.subscriptionId))
      .limit(1);

    if (sub?.couponCode) {
      const couponRows = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.code, sub.couponCode))
        .limit(1);

      if (couponRows.length > 0) {
        const coupon = couponRows[0];
        await db
          .update(couponsTable)
          .set({ usedCount: sql`used_count + 1` })
          .where(eq(couponsTable.id, coupon.id));

        await db
          .insert(couponUsesTable)
          .values({ couponId: coupon.id, userId: sub.userId })
          .onConflictDoNothing();
      }
    }

    res.redirect(`${APP_URL}/mi-plan?status=success`);
  } catch (err) {
    logger.error(err, "subscriptions/confirm error");
    res.redirect(`${APP_URL}/mi-plan?status=error&reason=exception`);
  }
});

// ─── POST /api/subscriptions/cancel-pending ───────────────────────────────────
// Cancela el último intento de pago pendiente sin tocar planes activos.
router.post("/subscriptions/cancel-pending", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const [pending] = await db
      .select({ id: subscriptionPaymentsTable.id })
      .from(subscriptionPaymentsTable)
      .where(and(
        eq(subscriptionPaymentsTable.userId, userId),
        eq(subscriptionPaymentsTable.status, "pending"),
      ))
      .orderBy(desc(subscriptionPaymentsTable.createdAt))
      .limit(1);

    if (!pending) {
      res.json({ ok: true, cancelled: false });
      return;
    }

    const cancelled = await cancelPendingAttempt(pending.id, userId);
    if (cancelled) {
      try {
        emitToUser(userId, "subscription_updated", { status: "cancelled", paymentId: pending.id });
      } catch {}
    }
    res.json({ ok: true, cancelled, paymentId: cancelled ? pending.id : null });
  } catch (err) {
    logger.error(err, "subscriptions/cancel-pending error");
    res.status(500).json({ error: "Error al cancelar el intento de pago" });
  }
});

// ─── POST /api/subscriptions/cancel ──────────────────────────────────────────
// Cancela la renovación — el plan sigue activo hasta el fin del período
router.post("/subscriptions/cancel", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;

    const rows = await db
      .select()
      .from(userSubscriptionsTable)
      .where(
        and(
          eq(userSubscriptionsTable.userId, userId),
          sql`status IN ('active','trialing')`
        )
      )
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "No hay suscripción activa" });
      return;
    }

    await db
      .update(userSubscriptionsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(userSubscriptionsTable.id, rows[0].id));

    res.json({ ok: true, activeUntil: rows[0].currentPeriodEnd });
  } catch (err) {
    logger.error(err, "subscriptions/cancel error");
    res.status(500).json({ error: "Error al cancelar suscripción" });
  }
});

// ─── GET /api/subscriptions/history ─────────────────────────────────────────
router.get("/subscriptions/history", authenticate, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const payments = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.userId, userId))
      .orderBy(desc(subscriptionPaymentsTable.createdAt))
      .limit(50);

    res.json(payments);
  } catch (err) {
    logger.error(err, "subscriptions/history error");
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

export default router;
