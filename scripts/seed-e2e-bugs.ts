/** Seed para prueba e2e de los 3 bugs (chat acuerdo/cancelación/radar). */
import { db, usersTable, servicesTable, categoriesTable, proposalsTable } from "../server/db";
import { hashPassword } from "../server/lib/auth";

async function main() {
  const stamp = Date.now();
  const cliEmail = `e2e-cli-${stamp}@test.local`;
  const wrkEmail = `e2e-wrk-${stamp}@test.local`;

  const [client] = await db.insert(usersTable).values({
    name: "E2E Cliente", email: cliEmail, password: hashPassword("test1234"),
    role: "client", emailVerified: true, phoneVerified: true,
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=EC",
  } as any).returning({ id: usersTable.id });

  const [worker] = await db.insert(usersTable).values({
    name: "E2E Experto", email: wrkEmail, password: hashPassword("test1234"),
    role: "worker", emailVerified: true, phoneVerified: true,
    kycStatus: "approved", isAvailable: true,
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=EW",
  } as any).returning({ id: usersTable.id });

  let [cat] = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
  if (!cat) {
    [cat] = await db.insert(categoriesTable).values({ name: "Gasfitería" } as any).returning({ id: categoriesTable.id });
  }

  const [svc] = await db.insert(servicesTable).values({
    title: "Reparación e2e llave cocina", description: "Prueba e2e de bugs de chat",
    status: "pending", clientId: client.id, categoryId: cat.id,
    address: "Av. Providencia 1234, Santiago", lat: -33.426, lng: -70.616,
  } as any).returning({ id: servicesTable.id });

  const [prop] = await db.insert(proposalsTable).values({
    serviceId: svc.id, workerId: worker.id, status: "pending", proposedPrice: null,
  } as any).returning({ id: proposalsTable.id });

  console.log(JSON.stringify({
    clientEmail: cliEmail, workerEmail: wrkEmail, password: "test1234",
    clientId: client.id, workerId: worker.id, serviceId: svc.id, proposalId: prop.id,
  }, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
