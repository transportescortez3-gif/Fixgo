import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Firmas electrónicas simples (Ley 19.799 Chile).
 * Guardamos imagen + huellas (hash, IP, UA, timestamp) que sirven como
 * evidencia de autoría y no repudio para una firma electrónica simple.
 */
export const signaturesTable = pgTable("signatures", {
  id:           serial("id").primaryKey(),
  ownerKey:     text("owner_key").notNull(),     // ej: "matias", "jonathan"
  ownerName:    text("owner_name").notNull(),    // nombre completo con que firma
  imageDataUrl: text("image_data_url").notNull(),// base64 PNG (data:image/png;base64,...)
  method:       text("method").notNull(),        // "drawn" | "typed"
  styleId:      text("style_id"),                // si typed: nombre de la fuente
  hash:         text("hash").notNull(),          // SHA-256(imageDataUrl + ownerName + createdAt iso)
  ipAddress:    text("ip_address"),
  userAgent:    text("user_agent"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_signatures_owner").on(t.ownerKey),
  index("idx_signatures_created").on(t.createdAt),
]);

export type Signature = typeof signaturesTable.$inferSelect;
