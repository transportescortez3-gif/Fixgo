import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db, securitySelfiesTable, servicesTable, usersTable } from "../db";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const objectStorage = new ObjectStorageService();

export function addBusinessDays(from: Date, businessDays: number): Date {
  const result = new Date(from);
  let remaining = businessDays;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export async function recordSecuritySelfie(input: {
  userId: number;
  role: "client" | "worker";
  objectPath: string;
  purpose: string;
  serviceId?: number | null;
  proposalId?: number | null;
  takenAt?: Date;
}) {
  const objectPath = objectStorage.normalizeObjectEntityPath(input.objectPath).replace(/^\/+/, "");
  if (!/^uploads\/[0-9a-f-]{36}$/.test(objectPath)) {
    throw new Error("Invalid security selfie object path");
  }
  const takenAt = input.takenAt ?? new Date();
  const [record] = await db.insert(securitySelfiesTable).values({
    userId: input.userId,
    role: input.role,
    serviceId: input.serviceId ?? null,
    proposalId: input.proposalId ?? null,
    purpose: input.purpose,
    objectPath,
    originalObjectPath: objectPath,
    takenAt,
    expiresAt: addBusinessDays(takenAt, 5),
  }).returning({
    id: securitySelfiesTable.id,
    takenAt: securitySelfiesTable.takenAt,
    expiresAt: securitySelfiesTable.expiresAt,
  });

  if (input.role === "worker") {
    await db.update(usersTable).set({
      securitySelfieRequired: false,
      lastActivityAt: new Date(),
    }).where(eq(usersTable.id, input.userId));

    // La selfie que habilita el desplazamiento debe quedar vinculada al
    // servicio, no a la propuesta. Así la dirección solo se puede revelar
    // después de completar la validación del trabajo asignado.
    if (input.serviceId && input.purpose === "service") {
      await db.update(servicesTable).set({
        workerSelfieUrl: objectPath,
        workerSelfieTakenAt: takenAt,
      }).where(and(
        eq(servicesTable.id, input.serviceId),
        eq(servicesTable.workerId, input.userId),
      ));
    }
  }

  return record;
}

export async function purgeExpiredSecuritySelfies(): Promise<number> {
  const now = new Date();
  const expired = await db.select({
    id: securitySelfiesTable.id,
    objectPath: securitySelfiesTable.objectPath,
  }).from(securitySelfiesTable).where(and(
    lte(securitySelfiesTable.expiresAt, now),
    isNull(securitySelfiesTable.deletedAt),
    isNotNull(securitySelfiesTable.objectPath),
  ));

  let purged = 0;
  for (const selfie of expired) {
    try {
      if (selfie.objectPath) await objectStorage.deleteObjectEntity(selfie.objectPath);
      await db.update(securitySelfiesTable).set({
        objectPath: null,
        deletedAt: now,
      }).where(and(
        eq(securitySelfiesTable.id, selfie.id),
        isNull(securitySelfiesTable.deletedAt),
      ));
      purged += 1;
    } catch (err) {
      // No se marca como purgada si el archivo no pudo eliminarse: el siguiente
      // ciclo debe reintentarlo para cumplir la retención máxima.
      logger.error({ err, selfieId: selfie.id }, "No se pudo purgar selfie de seguridad");
    }
  }

  if (purged > 0) logger.info({ purged }, "Selfies de seguridad purgadas");
  return purged;
}