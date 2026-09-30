import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || "Fixgo <noreply@fixxer.app>";

let resend: Resend | null = null;
if (apiKey) {
  resend = new Resend(apiKey);
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    logger.info({ to, subject }, "[EMAIL - no key configured] Would have sent email");
    return;
  }
  try {
    await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
  }
}

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
  body { font-family: Inter, sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background: #141414; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a; }
  .header { background: #0d1117; padding: 24px 32px; border-bottom: 2px solid #1a8cf8; }
  .logo { font-size: 24px; font-weight: 900; color: #1a8cf8; letter-spacing: -1px; }
  .body { padding: 32px; }
  .footer { padding: 16px 32px; border-top: 1px solid #2a2a2a; text-align: center; color: #666; font-size: 12px; }
  .btn { display: inline-block; background: #1a8cf8; color: #fff; font-weight: 700; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 24px; }
  h1 { font-size: 22px; color: #fff; margin: 0 0 16px; }
  p { color: #aaa; line-height: 1.6; margin: 0 0 12px; }
  .detail { background: #1a1a1a; border-radius: 8px; padding: 16px; margin: 16px 0; border: 1px solid #2a2a2a; }
</style></head>
<body><div class="container">
  <div class="header"><div class="logo">FIXGO</div></div>
  <div class="body">${content}</div>
  <div class="footer">© ${new Date().getFullYear()} Fixgo — Servicios del hogar a un toque de distancia</div>
</div></body></html>`;
}

export const emailService = {
  async sendWelcome(to: string, name: string, isWorker = false): Promise<void> {
    const workerMsg = isWorker
      ? `<p>Tu cuenta de <strong style="color:#f5c200">Profesional Fixgo</strong> fue creada. Completa tu perfil para empezar a recibir solicitudes.</p>`
      : `<p>Ahora puedes encontrar los mejores profesionales para tu hogar en minutos.</p>`;
    await send(to, "¡Bienvenido a Fixgo!", wrapHtml(`
      <h1>¡Hola, ${name}! 👋</h1>
      ${workerMsg}
      <a href="${process.env.APP_URL || "https://appfixgo.com"}" class="btn">Comenzar ahora</a>
    `));
  },

  async sendServiceCreated(to: string, workerName: string, serviceTitle: string, serviceId: number): Promise<void> {
    await send(to, `🔔 Nuevo trabajo disponible: ${serviceTitle}`, wrapHtml(`
      <h1>Tienes una nueva solicitud cerca</h1>
      <p>Hola ${workerName}, un cliente necesita tu ayuda con:</p>
      <div class="detail"><strong style="color:#fff">${serviceTitle}</strong></div>
      <p>Entra a Fixgo y envía tu cotización antes que otros profesionales.</p>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Ver solicitud</a>
    `));
  },

  async sendServiceAccepted(to: string, clientName: string, workerName: string, serviceTitle: string, serviceId: number): Promise<void> {
    await send(to, `¡Tu solicitud fue conectada!`, wrapHtml(`
      <h1>¡Conectado con un profesional!</h1>
      <p>Hola ${clientName}, el profesional <strong style="color:#f5c200">${workerName}</strong> aceptó tu solicitud:</p>
      <div class="detail"><strong style="color:#fff">${serviceTitle}</strong></div>
      <p>Ahora puedes chatear directamente con él para coordinar los detalles.</p>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Abrir chat</a>
    `));
  },

  async sendServiceStarted(to: string, clientName: string, workerName: string, serviceTitle: string, serviceId: number): Promise<void> {
    await send(to, `🔧 El profesional comenzó a trabajar`, wrapHtml(`
      <h1>El trabajo ha comenzado</h1>
      <p>Hola ${clientName}, <strong style="color:#f5c200">${workerName}</strong> ha iniciado el trabajo:</p>
      <div class="detail"><strong style="color:#fff">${serviceTitle}</strong></div>
      <p>Puedes hacer seguimiento en tiempo real desde la app.</p>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Ver seguimiento</a>
    `));
  },

  async sendServiceCompleted(to: string, recipientName: string, serviceTitle: string, serviceId: number): Promise<void> {
    await send(to, `Servicio completado: ${serviceTitle}`, wrapHtml(`
      <h1>Servicio completado ✓</h1>
      <p>Hola ${recipientName}, el siguiente servicio ha sido marcado como completado:</p>
      <div class="detail"><strong style="color:#fff">${serviceTitle}</strong></div>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Ver detalles</a>
    `));
  },

  async sendRequote(to: string, clientName: string, serviceTitle: string, message: string | null, serviceId: number): Promise<void> {
    await send(to, `⚠️ Re-cotización requerida: ${serviceTitle}`, wrapHtml(`
      <h1>El profesional solicita un ajuste</h1>
      <p>Hola ${clientName}, el profesional del servicio <strong style="color:#fff">${serviceTitle}</strong> solicita revisar los detalles contigo.</p>
      ${message ? `<div class="detail"><p style="margin:0;color:#aaa;font-style:italic">"${message}"</p></div>` : ""}
      <p>Entra al chat cifrado para coordinar directamente con el profesional.</p>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Abrir chat</a>
    `));
  },

  async sendNewMessage(to: string, recipientName: string, senderName: string, preview: string, serviceId: number): Promise<void> {
    await send(to, `Nuevo mensaje de ${senderName}`, wrapHtml(`
      <h1>Tienes un mensaje nuevo</h1>
      <p>Hola ${recipientName}, <strong style="color:#f5c200">${senderName}</strong> te escribió:</p>
      <div class="detail">${preview}</div>
      <a href="${process.env.APP_URL || "https://appfixgo.com"}/services/${serviceId}" class="btn">Responder</a>
    `));
  },

  async sendEmailVerification(to: string, name: string, verifyUrl: string): Promise<void> {
    await send(to, "Verifica tu correo electrónico — Fixgo", wrapHtml(`
      <h1>¡Bienvenido a Fixgo, ${name}!</h1>
      <p>Gracias por registrarte. Para activar tu cuenta y comenzar a usar Fixgo, verifica tu correo electrónico haciendo clic en el botón de abajo.</p>
      <a href="${verifyUrl}" class="btn">Verificar mi correo</a>
      <p style="margin-top:24px;font-size:12px;color:#666;">Este enlace expira en <strong style="color:#f5c200">24 horas</strong>. Si no creaste esta cuenta, ignora este mensaje.</p>
    `));
  },

  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
    await send(to, "Recuperación de contraseña — Fixgo", wrapHtml(`
      <h1>Recupera tu contraseña</h1>
      <p>Hola ${name}, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expira en <strong style="color:#f5c200">1 hora</strong>.</p>
      <a href="${resetUrl}" class="btn">Restablecer Contraseña</a>
      <p style="margin-top:24px;font-size:12px;color:#666;">Si no solicitaste este cambio, puedes ignorar este email. Tu contraseña permanecerá igual.</p>
    `));
  },

  async sendSubscriptionExpiry(to: string, name: string, planName: string, daysLeft: number, isTrial: boolean): Promise<void> {
    const APP_URL = process.env.APP_URL || "https://appfixgo.com";
    const urgency = daysLeft <= 3
      ? `<p style="color:#f87171;font-weight:700">⚠️ ¡Solo queda${daysLeft === 1 ? "" : "n"} ${daysLeft} día${daysLeft !== 1 ? "s" : ""}!</p>`
      : `<p style="color:#1a8cf8">Faltan ${daysLeft} días para el vencimiento.</p>`;

    const subject = isTrial
      ? `Tu prueba gratuita vence en ${daysLeft} días — Fixgo`
      : `Tu suscripción ${planName} vence en ${daysLeft} días — Fixgo`;

    const heading = isTrial
      ? `Tu período de prueba termina pronto`
      : `Tu suscripción está por vencer`;

    const body = isTrial
      ? `Hola ${name}, tu prueba gratuita del plan <strong style="color:#1a8cf8">${planName}</strong> vence en <strong style="color:#fff">${daysLeft} días</strong>. Activa un plan de pago para seguir recibiendo leads y accediendo a todas las funciones sin interrupciones.`
      : `Hola ${name}, tu suscripción al plan <strong style="color:#1a8cf8">${planName}</strong> vence en <strong style="color:#fff">${daysLeft} días</strong>. Para mantener tu acceso completo, renueva antes de que expire.`;

    await send(to, subject, wrapHtml(`
      <h1>${heading}</h1>
      ${urgency}
      <div class="detail">
        <p style="margin:0">${body}</p>
      </div>
      <p style="margin-top:16px;color:#aaa">Recuerda que la suscripción <strong style="color:#fff">no se renueva automáticamente</strong>. Debes iniciar el pago manualmente antes del vencimiento.</p>
      <a href="${APP_URL}/mi-plan" class="btn">Renovar mi plan</a>
      <p style="margin-top:24px;font-size:12px;color:#555">Si ya renovaste tu plan, ignora este mensaje.</p>
    `));
  },
};
