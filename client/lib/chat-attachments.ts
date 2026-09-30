import { decryptFile, encryptFile } from "./e2e-crypto";
import { getAuthToken } from "./brand-storage";

const MAX_FILES = 5;
const MAX_BYTES = 100 * 1024 * 1024;
const RETRIES = 2;

export type ChatAttachmentMeta = {
  id: number;
  originalName: string;
  contentType: string;
  category: string;
  size: number;
  status: string;
  e2eAvailable: boolean;
  createdAt: string;
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function jsonRequest(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, headers: authHeaders({ "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "No se pudo preparar el adjunto");
  return body;
}

async function uploadWithRetry(url: string, body: ArrayBuffer, contentType: string): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": contentType }),
        body,
      });
      if (response.ok) return;
      const bodyJson = await response.json().catch(() => null);
      lastError = new Error(bodyJson?.error || "No se pudo subir el adjunto");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Error de red al subir el adjunto");
    }
    if (attempt < RETRIES) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  throw lastError ?? new Error("No se pudo subir el adjunto");
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function validateChatFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return "Puedes enviar hasta 5 archivos por mensaje";
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) return "El total de un mensaje no puede superar 100 MB";
  for (const file of files) {
    if (/\.(exe|msi|apk|aab|bat|cmd|com|scr|sh|bash|ps1|vbs|js|mjs|cjs|jar|dll|so|dylib|php|py|rb|pl|cgi)$/i.test(file.name)) {
      return `${file.name}: este tipo de archivo no está permitido`;
    }
    if (file.size <= 0) return `${file.name}: el archivo está vacío`;
  }
  return null;
}

export async function uploadChatAttachment(
  serviceId: number,
  file: File,
  otherPublicKey: string,
  batchCount: number,
  batchBytes: number,
  workerId: number,
): Promise<ChatAttachmentMeta> {
  const prepared = await jsonRequest(`/api/services/${serviceId}/attachments/init`, {
    method: "POST",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream", batchCount, batchBytes, workerId }),
  });
  const encrypted = await encryptFile(file, otherPublicKey);
  await uploadWithRetry(prepared.e2eUploadUrl, await encrypted.arrayBuffer(), "application/octet-stream");
  await uploadWithRetry(prepared.supportUploadUrl, await file.arrayBuffer(), file.type || "application/octet-stream");
  const completed = await jsonRequest(`/api/services/${serviceId}/attachments/${prepared.attachment.id}/complete`, { method: "POST", body: "{}" });
  return completed.attachment as ChatAttachmentMeta;
}

export async function downloadAndDecryptChatAttachment(
  serviceId: number,
  attachmentId: number,
  otherPublicKey: string,
  workerId: number,
): Promise<Blob> {
  const response = await fetch(`/api/services/${serviceId}/attachments/${attachmentId}/content?workerId=${workerId}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "No se pudo abrir el adjunto");
  }
  return decryptFile(await response.arrayBuffer(), otherPublicKey);
}