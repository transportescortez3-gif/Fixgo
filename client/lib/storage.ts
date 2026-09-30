// Helper centralizado de subida de archivos al storage.
//
// Por qué existe:
//  - El cuerpo de la subida se enviaba como `File`. En el WebView de Android
//    el streaming del body se cuelga de forma intermitente (el PUT nunca recibe
//    respuesta → el spinner queda girando para siempre). Leer el archivo a un
//    `ArrayBuffer` y enviarlo completo en memoria evita ese cuelgue.
//  - Ningún sitio verificaba el resultado del PUT ni tenía timeout, así que un
//    fallo silencioso dejaba imágenes rotas o el spinner congelado.
//
// Las URLs son relativas a propósito: en la app nativa el monkeypatch de
// `window.fetch` (client/main.tsx) les antepone el servidor de producción.

import { getAuthToken } from "./brand-storage";

const REQUEST_URL_TIMEOUT_MS = 30_000;
const PUT_TIMEOUT_MS = 90_000;

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function uploadErrorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) {
    return "Tu sesión expiró. Inicia sesión nuevamente para publicar.";
  }

  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === "string" && data.error.trim() ? data.error : fallback;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("La subida tardó demasiado. Revisa tu conexión e inténtalo de nuevo.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sube un archivo al storage y devuelve su `objectPath` (ej. `uploads/<uuid>`).
 * Lanza un Error con mensaje en español si algo falla.
 */
export async function uploadFileToStorage(file: File): Promise<string> {
  // 1. Solicitar la URL de subida.
  const urlRes = await fetchWithTimeout(
    `/api/storage/uploads/request-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    },
    REQUEST_URL_TIMEOUT_MS,
  );
  if (!urlRes.ok) {
    throw new Error(await uploadErrorMessage(urlRes, "No se pudo solicitar la URL de subida"));
  }
  const { objectPath } = (await urlRes.json()) as { objectPath: string };
  if (!objectPath) {
    throw new Error("Respuesta de subida inválida");
  }

  // 2. Leer el archivo a memoria antes de enviarlo (evita el cuelgue del WebView).
  const buffer = await file.arrayBuffer();

  // 3. Subir el contenido.
  const putRes = await fetchWithTimeout(
    `/api/storage/${objectPath}`,
    {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream", ...authHeaders() },
      body: buffer,
    },
    PUT_TIMEOUT_MS,
  );
  if (!putRes.ok) {
    throw new Error(await uploadErrorMessage(putRes, "No se pudo subir el archivo"));
  }

  return objectPath;
}
