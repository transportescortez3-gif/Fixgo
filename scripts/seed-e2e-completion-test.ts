/**
 * Seed temporal para el test e2e del flujo "cliente finaliza el trabajo":
 * crea cliente + experto (password conocida), servicio in_progress y propuesta
 * aceptada, para que el agente de testing pueda loguearse por UI.
 *
 * Uso:  npx tsx scripts/seed-e2e-completion-test.ts          (limpia y siembra)
 *       npx tsx scripts/seed-e2e-completion-test.ts --clean  (solo limpia)
 */
import { db, usersTable, servicesTable, categoriesTable, proposalsTable } from "../server/db";
import { hashPassword } from "../server/lib/auth";
import { eq, inArray, or, sql } from "drizzle-orm";

const CLIENT_EMAIL = "e2e.cliente@fixxer.test";
const WORKER_EMAIL = "e2e.experto@fixxer.test";
const PASSWORD = "test1234";
const SERVICE_TITLE = "E2E Finalización de trabajo";

async function cleanup() {
  const users = await db.select({ id: usersTable.id }).from(usersTable)
    .where(inArray(usersTable.email, [CLIENT_EMAIL, WORKER_EMAIL]));
  const ids = users.map(u => u.id);
  if (ids.length === 0) { console.log("cleanup: nada que limpiar"); return; }
  const idList = ids.join(",");
  // Borrar dependencias con SQL directo (orden: hijos → padres)
  const stmts = [
    `DELETE FROM messages WHERE service_id IN (SELECT id FROM services WHERE client_id IN (${idList}) OR worker_id IN (${idList}))`,
    `DELETE FROM reviews WHERE client_id IN (${idList}) OR worker_id IN (${idList})`,
    `DELETE FROM user_favorites WHERE vinculador_id IN (${idList}) OR vinculado_id IN (${idList})`,
    `DELETE FROM notifications WHERE user_id IN (${idList})`,
    `DELETE FROM user_e2e_devices WHERE user_id IN (${idList})`,
    `DELETE FROM user_crypto_keys WHERE user_id IN (${idList})`,
    `DELETE FROM proposals WHERE worker_id IN (${idList}) OR service_id IN (SELECT id FROM services WHERE client_id IN (${idList}))`,
    `DELETE FROM alert_sessions WHERE service_id IN (SELECT id FROM services WHERE client_id IN (${idList}))`,
    `DELETE FROM services WHERE client_id IN (${idList}) OR worker_id IN (${idList})`,
  ];
  for (const s of stmts) {
    try { await db.execute(sql.raw(s)); } catch (e: any) { console.log("cleanup aviso:", e.message?.slice(0, 120)); }
  }
  try {
    await db.delete(usersTable).where(inArray(usersTable.id, ids));
    console.log("cleanup: usuarios e2e eliminados", ids);
  } catch (e: any) {
    console.log("cleanup ERROR al borrar usuarios:", e.message?.slice(0, 200));
  }
}

async function main() {
  await cleanup();
  if (process.argv.includes("--clean")) return;

  let [cat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
  if (!cat) {
    [cat] = await db.insert(categoriesTable).values({ name: "Electricidad", icon: "zap" } as any)
      .returning({ id: categoriesTable.id });
  }

  // phone/phoneVerified/avatarUrl completos para saltar los gates de onboarding
  const [client] = await db.insert(usersTable).values({
    name: "Cliente E2E", email: CLIENT_EMAIL, password: hashPassword(PASSWORD),
    role: "client", emailVerified: true, phone: "+56911111111", phoneVerified: true,
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=CE",
  } as any).returning({ id: usersTable.id });

  const [worker] = await db.insert(usersTable).values({
    name: "Experto E2E", email: WORKER_EMAIL, password: hashPassword(PASSWORD),
    role: "worker", emailVerified: true, kycStatus: "approved", isAvailable: true,
    categoryId: cat.id, phone: "+56922222222", phoneVerified: true,
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=EE",
  } as any).returning({ id: usersTable.id });

  const [svc] = await db.insert(servicesTable).values({
    title: SERVICE_TITLE, description: "Servicio de prueba e2e para verificar el flujo de finalización",
    status: "in_progress", clientId: client.id, workerId: worker.id, categoryId: cat.id,
    address: "Av. Providencia 1234, Santiago",
  } as any).returning({ id: servicesTable.id });

  await db.insert(proposalsTable).values({
    serviceId: svc.id, workerId: worker.id, status: "accepted",
    message: "Propuesta e2e", estimatedTime: "1 hora",
  } as any);

  console.log(JSON.stringify({
    clientId: client.id, workerId: worker.id, serviceId: svc.id,
    clientEmail: CLIENT_EMAIL, workerEmail: WORKER_EMAIL, password: PASSWORD,
    serviceTitle: SERVICE_TITLE,
  }, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error("ERROR:", e); process.exit(1); });
