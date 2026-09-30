/** Verifica GET /proposals/my tras el cambio a EXISTS: sin duplicados aunque
 *  haya 2 filas de review para el mismo servicio, y reviewedByWorker correcto. */
import { db, usersTable, servicesTable, categoriesTable, proposalsTable, reviewsTable } from "../server/db";
import { signToken } from "../server/lib/auth";
import { inArray, eq } from "drizzle-orm";

const BASE = "http://localhost:5000/api";

async function main() {
  let [cat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
  if (!cat) [cat] = await db.insert(categoriesTable).values({ name: "VerifyCat", icon: "zap" } as any).returning({ id: categoriesTable.id });

  const [client] = await db.insert(usersTable).values({ name: "VerifyC", email: `vc${Date.now()}@t.test`, password: "x", role: "client", emailVerified: true } as any).returning({ id: usersTable.id });
  const [worker] = await db.insert(usersTable).values({ name: "VerifyW", email: `vw${Date.now()}@t.test`, password: "x", role: "worker", emailVerified: true } as any).returning({ id: usersTable.id });
  const [svc] = await db.insert(servicesTable).values({ title: "Verify svc", description: "t", status: "completed", clientId: client.id, workerId: worker.id, categoryId: cat.id } as any).returning({ id: servicesTable.id });
  await db.insert(proposalsTable).values({ serviceId: svc.id, workerId: worker.id, status: "accepted" } as any);
  // DOS filas de review para el mismo servicio (caso fanout del review anterior)
  await db.insert(reviewsTable).values({ serviceId: svc.id, clientId: client.id, workerId: worker.id, rating: 5, reviewedByWorker: false } as any);
  await db.insert(reviewsTable).values({ serviceId: svc.id, clientId: client.id, workerId: worker.id, rating: 4, reviewedByWorker: true } as any);

  try {
    const token = signToken({ id: worker.id, role: "worker" } as any);
    const res = await fetch(`${BASE}/proposals/my`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    const mine = Array.isArray(body) ? body.filter((p: any) => p.serviceId === svc.id) : [];
    console.log("GET /proposals/my:", res.status, "| filas para el servicio:", mine.length, "| reviewedByWorker:", mine[0]?.service?.reviewedByWorker);
    const ok = res.status === 200 && mine.length === 1 && mine[0]?.service?.reviewedByWorker === true;
    console.log(ok ? "✅ sin duplicados y reviewedByWorker=true" : "❌ FALLO");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await db.delete(reviewsTable).where(eq(reviewsTable.serviceId, svc.id));
    await db.delete(proposalsTable).where(eq(proposalsTable.serviceId, svc.id));
    await db.delete(servicesTable).where(eq(servicesTable.id, svc.id));
    await db.delete(usersTable).where(inArray(usersTable.id, [client.id, worker.id]));
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error("ERROR:", e); process.exit(1); });
