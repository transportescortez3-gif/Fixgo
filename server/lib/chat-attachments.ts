import { db, chatAttachmentsTable } from "../db";
import { and, eq, inArray, isNotNull, isNull, lte, lt, or } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

export const CHAT_ATTACHMENT_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  archive: 50 * 1024 * 1024,
} as const;

export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const SUPPORT_RETENTION_DAYS = 7;

const BLOCKED_EXTENSIONS = /\.(?:exe|msi|apk|aab|bat|cmd|com|scr|sh|bash|ps1|vbs|js|mjs|cjs|jar|dll|so|dylib|php|py|rb|pl|cgi)$/i;
const BLOCKED_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/vnd.android.package-archive",
  "application/x-sh",
  "text/x-shellscript",
  "application/javascript",
  "text/javascript",
]);

export type ChatAttachmentCategory = keyof typeof CHAT_ATTACHMENT_LIMITS;

export function getAttachmentCategory(name: string, contentType: string): ChatAttachmentCategory | null {
  const lowerName = name.toLowerCase();
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (BLOCKED_EXTENSIONS.test(lowerName) || BLOCKED_TYPES.has(type)) return null;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/x-7z-compressed" ||
    type === "application/x-rar-compressed" ||
    type === "application/gzip" ||
    type === "application/x-tar" ||
    /\.(zip|7z|rar|gz|tar)$/i.test(lowerName)
  ) return "archive";
  if (
    type === "application/pdf" ||
    type.startsWith("text/") ||
    type.includes("word") ||
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    type.includes("presentation") ||
    type.includes("opendocument") ||
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods|odp)$/i.test(lowerName)
  ) return "document";
  return null;
}

export function validateAttachmentMeta(name: unknown, size: unknown, contentType: unknown) {
  if (typeof name !== "string" || !name.trim() || name.length > 255) {
    return { error: "El nombre del archivo no es válido" } as const;
  }
  if (!Number.isInteger(size) || Number(size) <= 0) {
    return { error: "El tamaño del archivo no es válido" } as const;
  }
  if (typeof contentType !== "string" || !contentType.trim()) {
    return { error: "El tipo de archivo no es válido" } as const;
  }
  const category = getAttachmentCategory(name, contentType);
  if (!category) return { error: "Este tipo de archivo no está permitido" } as const;
  const limit = CHAT_ATTACHMENT_LIMITS[category];
  if (Number(size) > limit) {
    return { error: `El límite para ${category === "image" ? "fotos" : category === "video" ? "videos" : category === "audio" ? "audio" : category === "archive" ? "comprimidos" : "documentos"} es ${Math.round(limit / 1024 / 1024)} MB` } as const;
  }
  return { category, name: name.trim(), size: Number(size), contentType: contentType.split(";")[0].trim() } as const;
}

function publicAttachment(row: typeof chatAttachmentsTable.$inferSelect) {
  return {
    id: row.id,
    originalName: row.originalName,
    contentType: row.contentType,
    category: row.category,
    size: row.size,
    status: row.status,
    e2eAvailable: !!row.e2eObjectPath && !row.e2eDeletedAt,
    createdAt: row.createdAt,
  };
}

export function toPublicChatAttachment(row: typeof chatAttachmentsTable.$inferSelect) {
  return publicAttachment(row);
}

export async function deleteAttachmentObject(pathValue: string | null | undefined): Promise<void> {
  if (!pathValue) return;
  try {
    await new ObjectStorageService().deleteObjectEntity(pathValue);
  } catch (error) {
    logger.warn({ err: error, objectPath: pathValue }, "Could not delete chat attachment object");
  }
}

/**
 * Removes the participant copy immediately, while retaining the support copy
 * for the complaint/audit window. Safe to call more than once.
 */
export async function removeE2EChatAttachments(serviceId: number): Promise<number> {
  const rows = await db.select({
    id: chatAttachmentsTable.id,
    e2eObjectPath: chatAttachmentsTable.e2eObjectPath,
  }).from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.serviceId, serviceId),
    or(
      isNotNull(chatAttachmentsTable.e2eObjectPath),
      isNotNull(chatAttachmentsTable.supportObjectPath),
    ),
  ));
  if (!rows.length) return 0;
  for (const row of rows) await deleteAttachmentObject(row.e2eObjectPath);
  await db.update(chatAttachmentsTable)
    .set({
      e2eObjectPath: null,
      e2eDeletedAt: new Date(),
      supportExpiresAt: new Date(Date.now() + SUPPORT_RETENTION_DAYS * 86400000),
    })
    .where(inArray(chatAttachmentsTable.id, rows.map(row => row.id)));
  return rows.length;
}

export async function removeAllChatAttachmentObjects(serviceId: number): Promise<number> {
  const rows = await db.select({
    id: chatAttachmentsTable.id,
    e2eObjectPath: chatAttachmentsTable.e2eObjectPath,
    supportObjectPath: chatAttachmentsTable.supportObjectPath,
  }).from(chatAttachmentsTable).where(eq(chatAttachmentsTable.serviceId, serviceId));
  for (const row of rows) {
    await deleteAttachmentObject(row.e2eObjectPath);
    await deleteAttachmentObject(row.supportObjectPath);
  }
  return rows.length;
}

export async function purgeExpiredChatAttachmentSupportCopies(): Promise<number> {
  const rows = await db.select({
    id: chatAttachmentsTable.id,
    e2eObjectPath: chatAttachmentsTable.e2eObjectPath,
    supportObjectPath: chatAttachmentsTable.supportObjectPath,
  }).from(chatAttachmentsTable).where(and(
    lte(chatAttachmentsTable.supportExpiresAt, new Date()),
    or(
      isNotNull(chatAttachmentsTable.supportObjectPath),
      isNotNull(chatAttachmentsTable.e2eObjectPath),
    ),
  ));
  for (const row of rows) {
    await deleteAttachmentObject(row.supportObjectPath);
    await deleteAttachmentObject(row.e2eObjectPath);
    await db.update(chatAttachmentsTable).set({
      e2eObjectPath: null,
      supportObjectPath: null,
      e2eDeletedAt: row.e2eObjectPath ? new Date() : undefined,
      supportDeletedAt: new Date(),
      status: "deleted",
    }).where(eq(chatAttachmentsTable.id, row.id));
  }
  return rows.length;
}

export async function purgeOrphanedChatAttachments(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select({
    id: chatAttachmentsTable.id,
    e2eObjectPath: chatAttachmentsTable.e2eObjectPath,
    supportObjectPath: chatAttachmentsTable.supportObjectPath,
  }).from(chatAttachmentsTable).where(and(
    eq(chatAttachmentsTable.status, "pending"),
    isNull(chatAttachmentsTable.messageId),
    lt(chatAttachmentsTable.createdAt, cutoff),
  ));
  for (const row of rows) {
    await deleteAttachmentObject(row.e2eObjectPath);
    await deleteAttachmentObject(row.supportObjectPath);
    await db.delete(chatAttachmentsTable).where(eq(chatAttachmentsTable.id, row.id));
  }
  return rows.length;
}