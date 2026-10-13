import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userCryptoKeysTable = pgTable("user_crypto_keys", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id),
  publicKey: text("public_key").notNull(),
  // Respaldo de la llave privada CIFRADA con una clave derivada de la contraseña
  // del usuario (PBKDF2 + AES-GCM). El servidor nunca ve la llave en texto plano:
  // solo almacena el blob cifrado, la sal del KDF, el IV y las iteraciones.
  encryptedPrivateKey: text("encrypted_private_key"),
  kdfSalt: text("kdf_salt"),
  kdfIv: text("kdf_iv"),
  kdfIterations: integer("kdf_iterations"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Dispositivos "de confianza" para restaurar el respaldo de la llave E2E, al
// estilo WhatsApp: el número de teléfono verificado de la cuenta autoriza que
// un dispositivo nuevo pueda descargar y descifrar el respaldo. Un dispositivo
// que YA posee la llave local (el original, o cualquiera ya verificado antes)
// queda marcado de confianza automáticamente; uno nuevo debe probar, vía SMS,
// que su dueño controla el teléfono de la cuenta antes de recibir el respaldo.
export const userE2eDevicesTable = pgTable("user_e2e_devices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  deviceId: text("device_id").notNull(),
  verifiedPhone: text("verified_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDeviceUnique: unique("user_e2e_devices_user_device_unique").on(table.userId, table.deviceId),
}));
