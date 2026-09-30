import { eq } from "drizzle-orm";
import { db, usersTable } from "../db";

/**
 * Sistema de cancelación tardía: un experto solo puede recibir trabajos si
 * tiene su tarifa de visita técnica (> 0) y sus 4 datos de transferencia
 * completos (banco, tipo de cuenta, N° de cuenta y RUT). Sin esto, el cargo
 * por cancelación tardía no tendría snapshot bancario válido.
 *
 * Usar este helper en TODOS los caminos que crean propuestas o asignan un
 * worker a un servicio (ruta REST de propuestas, auto-propuestas del motor
 * de alertas, primer mensaje del worker, accepts).
 */
export async function isWorkerPayoutComplete(workerId: number): Promise<boolean> {
  const [w] = await db.select({
    visitFee: usersTable.visitFee,
    payoutBankName: usersTable.payoutBankName,
    payoutBankAccountType: usersTable.payoutBankAccountType,
    payoutBankAccountNumber: usersTable.payoutBankAccountNumber,
    payoutBankRut: usersTable.payoutBankRut,
  }).from(usersTable).where(eq(usersTable.id, workerId)).limit(1);

  return !!w &&
    w.visitFee != null && w.visitFee > 0 &&
    !!w.payoutBankName && !!w.payoutBankAccountType &&
    !!w.payoutBankAccountNumber && !!w.payoutBankRut;
}

export const PROFILE_INCOMPLETE_MESSAGE =
  "Antes de conectarte debes completar tu perfil: tarifa de visita técnica y datos de transferencia (banco, tipo de cuenta, N° de cuenta y RUT).";
