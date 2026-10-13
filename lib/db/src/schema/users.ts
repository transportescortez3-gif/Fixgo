import { pgTable, text, serial, integer, timestamp, boolean, real, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const userRoleEnum = pgEnum("user_role", ["client", "worker", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "blocked", "pending"]);
export const payoutMethodEnum = pgEnum("payout_method", ["bank_transfer"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("client"),
  status: userStatusEnum("status").notNull().default("active"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  skills: text("skills"),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  rating: real("rating"),
  totalReviews: integer("total_reviews").notNull().default(0),
  clientRating: real("client_rating"),
  clientTotalReviews: integer("client_total_reviews").notNull().default(0),
  kycStatus: text("kyc_status").notNull().default("not_submitted"),
  isAvailable: boolean("is_available").notNull().default(false),
  serviceRadius: integer("service_radius").notNull().default(50),
  lat: real("lat"),
  lng: real("lng"),
  fcmToken: text("fcm_token"),
  // Token FCM del navegador (web push). Separado de fcmToken (app nativa) porque
  // un usuario puede usar la web y la app nativa en dispositivos distintos.
  fcmTokenWeb: text("fcm_token_web"),
  // Token de PushKit (VoIP) del dispositivo iOS. Separado de fcmToken porque los
  // push VoIP de iOS viajan por APNs directamente, no por FCM.
  voipToken: text("voip_token"),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true }),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyToken: text("email_verify_token"),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  payoutMethod: payoutMethodEnum("payout_method"),
  payoutPaypalEmail: text("payout_paypal_email"),
  payoutBankName: text("payout_bank_name"),
  payoutBankAccountType: text("payout_bank_account_type"),
  payoutBankRut: text("payout_bank_rut"),
  payoutBankAccountNumber: text("payout_bank_account_number"),
  payoutDataConsent: boolean("payout_data_consent").notNull().default(false),
  balance: integer("balance").notNull().default(0),
  balanceGifted: boolean("balance_gifted").notNull().default(false),
  platformType: text("platform_type").notNull().default("expertos"),
  presentationVideoUrl: text("presentation_video_url"),
  visitFee: integer("visit_fee"),
  alertCooldownUntil: timestamp("alert_cooldown_until", { withTimezone: true }),
  // Suspensión automática por cancelaciones tardías (escala 24h/7d/30d).
  // El bloqueo definitivo NUNCA es automático: solo manual desde el panel admin.
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  suspensionCount: integer("suspension_count").notNull().default(0),
  alertRadiusKm: integer("alert_radius_km"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  securitySelfieRequired: boolean("security_selfie_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_users_role").on(table.role),
  index("idx_users_status").on(table.status),
  index("idx_users_category_id").on(table.categoryId),
  index("idx_users_is_available").on(table.isAvailable),
  index("idx_users_kyc_status").on(table.kycStatus),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, totalReviews: true, clientTotalReviews: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
