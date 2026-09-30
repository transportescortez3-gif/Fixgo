import { Capacitor } from "@capacitor/core";
import { getAuthToken } from "./brand-storage";
import { APP_URL } from "./app-config";

const KEY_PAIR_STORAGE = "fixgo_e2e_keypair_v1";
const ENCRYPTED_PREFIX = "e2e:";
const PBKDF2_ITERATIONS = 200_000;

// En nativo (Capacitor) las rutas relativas apuntan al origen del WebView, no al
// backend; por eso se usa la base absoluta. En web queda relativo al mismo origen.
function apiBase(): string {
  return Capacitor.isNativePlatform() ? APP_URL : "";
}

function getAuthHeader(): Record<string, string> {
  const token = getAuthToken() || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// El par de llaves local se vincula al usuario autenticado para evitar que, en un
// navegador multi-cuenta, la llave de un usuario sea reutilizada por otro (lo que
// rompería el requisito de "un solo par por usuario"). Se namespacea por userId,
// que se obtiene decodificando el payload del JWT.
function currentUserId(): number | null {
  const token = getAuthToken() || localStorage.getItem("token");
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return typeof payload?.id === "number" ? payload.id : null;
  } catch {
    return null;
  }
}

function nsKeyName(): string {
  const uid = currentUserId();
  return uid != null ? `${KEY_PAIR_STORAGE}:${uid}` : KEY_PAIR_STORAGE;
}

interface LocalKeyPair {
  pub: JsonWebKey;
  priv: JsonWebKey;
}

function publicKeysMatch(a: JsonWebKey | null | undefined, b: JsonWebKey | null | undefined): boolean {
  return !!a && !!b && a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y;
}

function publicFromPrivate(priv: JsonWebKey): JsonWebKey {
  return {
    kty: priv.kty,
    crv: priv.crv,
    x: priv.x,
    y: priv.y,
    ext: true,
    key_ops: [],
  };
}

function writeLocalKeyPair(pub: JsonWebKey, priv: JsonWebKey): void {
  localStorage.setItem(nsKeyName(), JSON.stringify({ pub, priv }));
}

// Lee la llave local del usuario actual. Migra de forma SEGURA la llave legacy
// global (sin namespacing) solo si su pública coincide con la registrada en el
// servidor para este usuario — así confirmamos que la llave realmente le
// pertenece antes de adoptarla (evita asignar la llave de otro usuario).
async function loadLocalKeyPair(): Promise<LocalKeyPair | null> {
  const nsName = nsKeyName();
  const stored = localStorage.getItem(nsName);
  if (stored) {
    try {
      const { pub, priv } = JSON.parse(stored);
      if (pub && priv) return { pub, priv };
    } catch {
    }
  }

  const uid = currentUserId();
  if (uid == null || nsName === KEY_PAIR_STORAGE) return null;

  const legacy = localStorage.getItem(KEY_PAIR_STORAGE);
  if (!legacy) return null;
  try {
    const { pub, priv } = JSON.parse(legacy);
    if (!pub || !priv) return null;
    const serverPub = await fetchPublicKey(uid);
    if (serverPub) {
      const sp = JSON.parse(serverPub);
      if (sp?.x === pub.x && sp?.y === pub.y && sp?.crv === pub.crv) {
        // Confirmado: la llave legacy es de este usuario → migrar al namespace.
        localStorage.setItem(nsName, legacy);
        localStorage.removeItem(KEY_PAIR_STORAGE);
        return { pub, priv };
      }
    }
  } catch {
  }
  return null;
}

export function isEncryptedBlob(content: string): boolean {
  return typeof content === "string" && content.startsWith(ENCRYPTED_PREFIX);
}

export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  const local = await loadLocalKeyPair();
  if (local) {
    const publicKey = await crypto.subtle.importKey(
      "jwk", local.pub,
      { name: "ECDH", namedCurve: "P-256" },
      true, []
    );
    const privateKey = await crypto.subtle.importKey(
      "jwk", local.priv,
      { name: "ECDH", namedCurve: "P-256" },
      false, ["deriveKey"]
    );
    return { publicKey, privateKey };
  }

  // No hay llave local. NO se debe auto-generar a ciegas: si el usuario ya tiene
  // un respaldo en el servidor (otro dispositivo), generar aquí crearía una llave
  // desincronizada cuya pública el servidor rechaza (409), dejando los mensajes
  // de este dispositivo indescifrables para los demás. Solo se genera cuando el
  // servidor CONFIRMA que no existe respaldo. Si hay respaldo, hay que restaurarlo
  // vía login (restoreOrCreateKeyPair); si falla la red, se propaga el error.
  let remoteBackup: KeyBackup | null;
  remoteBackup = await fetchKeyBackup();
  if (remoteBackup) {
    throw new Error(
      "Existe un respaldo de llave E2E sin restaurar en este dispositivo. Inicia sesión nuevamente para sincronizar tu llave.",
    );
  }

  // Sin respaldo: si el servidor YA tiene una pública para este usuario, este
  // dispositivo no posee la llave original. Generar una nueva aquí crearía una
  // llave local divergente (cifraría mensajes que el otro extremo no podría leer
  // y la subida sería rechazada con 409). Se aborta para que la UI bloquee el
  // envío y pida restaurar la llave desde el dispositivo original. En estado
  // incierto (sin conexión) tampoco se genera, para no rotar por error.
  const uid = currentUserId();
  if (uid != null) {
    const state = await fetchOwnPublicKeyState(uid);
    if (state === "exists") {
      throw new Error(
        "No hay llave E2E en este dispositivo. Inicia sesión desde tu dispositivo original para sincronizar tu llave y leer/enviar mensajes aquí.",
      );
    }
    if (state === "unknown") {
      throw new Error("No se pudo verificar tu llave E2E (sin conexión). Intenta de nuevo.");
    }
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  writeLocalKeyPair(pub, priv);
  return pair;
}

export async function exportPublicKeyJwk(): Promise<string> {
  const { publicKey } = await getOrCreateKeyPair();
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );
}

async function deriveSharedAesKey(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(plaintext: string, otherPublicKeyJwk: string): Promise<string> {
  const { privateKey } = await getOrCreateKeyPair();
  const otherKey = await importPublicKey(otherPublicKeyJwk);
  const aesKey = await deriveSharedAesKey(privateKey, otherKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  const base64 = btoa(String.fromCharCode(...combined));
  return ENCRYPTED_PREFIX + base64;
}

export async function decryptMessage(encryptedContent: string, otherPublicKeyJwk: string): Promise<string> {
  if (!isEncryptedBlob(encryptedContent)) return encryptedContent;

  const { privateKey } = await getOrCreateKeyPair();
  const otherKey = await importPublicKey(otherPublicKeyJwk);
  const aesKey = await deriveSharedAesKey(privateKey, otherKey);

  const base64 = encryptedContent.slice(ENCRYPTED_PREFIX.length);
  const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export async function encryptFile(file: Blob, otherPublicKeyJwk: string): Promise<Blob> {
  const { privateKey } = await getOrCreateKeyPair();
  const otherKey = await importPublicKey(otherPublicKeyJwk);
  const aesKey = await deriveSharedAesKey(privateKey, otherKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    await file.arrayBuffer(),
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return new Blob([combined], { type: "application/octet-stream" });
}

export async function decryptFile(encrypted: ArrayBuffer, otherPublicKeyJwk: string): Promise<Blob> {
  const { privateKey } = await getOrCreateKeyPair();
  const otherKey = await importPublicKey(otherPublicKeyJwk);
  const aesKey = await deriveSharedAesKey(privateKey, otherKey);
  const bytes = new Uint8Array(encrypted);
  if (bytes.byteLength < 13) throw new Error("Adjunto cifrado inválido");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    aesKey,
    bytes.slice(12),
  );
  return new Blob([plaintext]);
}

// Mejora: caché con TTL de 5 minutos para que cambios de clave pública
// (ej. nuevo dispositivo) se reflejen sin necesidad de recargar la página
const PUB_KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const pubKeyCache: Record<number, { key: string; expiresAt: number }> = {};

export function invalidatePublicKeyCache(userId?: number): void {
  if (userId !== undefined) {
    delete pubKeyCache[userId];
  } else {
    Object.keys(pubKeyCache).forEach(k => delete pubKeyCache[Number(k)]);
  }
}

export async function fetchPublicKey(userId: number): Promise<string | null> {
  const cached = pubKeyCache[userId];
  if (cached && cached.expiresAt > Date.now()) return cached.key;
  try {
    const res = await fetch(`${apiBase()}/api/messages/keys/${userId}`, {
      headers: { ...getAuthHeader() },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    if (publicKey) pubKeyCache[userId] = { key: publicKey, expiresAt: Date.now() + PUB_KEY_CACHE_TTL_MS };
    return publicKey ?? null;
  } catch {
    return null;
  }
}

// Estado de la pública del usuario en el servidor, distinguiendo 404 ("no hay
// pública") de un fallo de red/HTTP ("incierto"). Es crítico no confundirlos:
// tratar un error transitorio como "no hay pública" llevaría a generar una llave
// nueva y rotar la identidad, rompiendo el descifrado del historial.
async function fetchOwnPublicKeyState(userId: number): Promise<"exists" | "absent" | "unknown"> {
  try {
    const res = await fetch(`${apiBase()}/api/messages/keys/${userId}`, {
      headers: { ...getAuthHeader() },
      cache: "no-store",
    });
    if (res.status === 404) return "absent";
    if (!res.ok) return "unknown";
    const { publicKey } = await res.json();
    return publicKey ? "exists" : "absent";
  } catch {
    return "unknown";
  }
}

export async function uploadPublicKey(): Promise<boolean> {
  try {
    const publicKey = await exportPublicKeyJwk();
    const res = await fetch(`${apiBase()}/api/messages/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ publicKey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function localKeyMatchesServer(): Promise<boolean | null> {
  const uid = currentUserId();
  if (uid == null) return null;
  const local = await loadLocalKeyPair();
  if (!local) return false;
  invalidatePublicKeyCache(uid);
  const serverRaw = await fetchPublicKey(uid);
  if (!serverRaw) return null;
  try {
    return publicKeysMatch(local.pub, JSON.parse(serverRaw) as JsonWebKey);
  } catch {
    return null;
  }
}

/**
 * Regenera forzosamente el par de llaves E2E del usuario en este dispositivo.
 * Úsalo cuando no haya llave local ni respaldo en el servidor (p.ej. sesión
 * nueva o primera vez en este navegador). Si el servidor tenía una llave
 * anterior sin respaldo, la elimina primero y genera un par nuevo.
 * Los mensajes anteriores cifrados con la llave vieja dejarán de ser legibles.
 */
export async function forceRegenerateKeyPair(): Promise<void> {
  // 1. Borrar clave local del namespace actual
  localStorage.removeItem(nsKeyName());
  localStorage.removeItem(KEY_PAIR_STORAGE);

  // 2. Borrar clave del servidor (ignora errores de red)
  try {
    await fetch(`${apiBase()}/api/messages/keys`, {
      method: "DELETE",
      headers: { ...getAuthHeader() },
    });
  } catch { /* continuar aunque falle la red */ }

  // 3. Generar nuevo par
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
  );
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  writeLocalKeyPair(pub, priv);

  // 4. Subir nueva clave pública al servidor
  const publicKey = JSON.stringify(pub);
  await fetch(`${apiBase()}/api/messages/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ publicKey }),
  });

  invalidatePublicKeyCache();
}

// ── Respaldo/sincronización de llave entre dispositivos ─────────────────────
// Se guarda en el servidor una copia de la llave privada CIFRADA con una clave
// derivada de la contraseña del usuario (PBKDF2 → AES-GCM). La llave privada en
// texto plano NUNCA viaja al servidor: solo el blob cifrado, la sal y el IV.

interface KeyBackup {
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfIv: string;
  kdfIterations: number;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveWrapKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function wrapPrivateKey(privJwk: JsonWebKey, password: string): Promise<KeyBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(password, salt, PBKDF2_ITERATIONS);
  const data = new TextEncoder().encode(JSON.stringify(privJwk));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, data);
  return {
    encryptedPrivateKey: bufToB64(ciphertext),
    kdfSalt: bufToB64(salt.buffer),
    kdfIv: bufToB64(iv.buffer),
    kdfIterations: PBKDF2_ITERATIONS,
  };
}

async function unwrapPrivateKey(backup: KeyBackup, password: string): Promise<JsonWebKey> {
  const salt = b64ToBuf(backup.kdfSalt);
  const iv = b64ToBuf(backup.kdfIv);
  const wrapKey = await deriveWrapKey(password, salt, backup.kdfIterations || PBKDF2_ITERATIONS);
  const ciphertext = b64ToBuf(backup.encryptedPrivateKey);
  const data = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    wrapKey,
    ciphertext as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(data)) as JsonWebKey;
}

// Distingue explícitamente "sin respaldo confirmado" (null) de un fallo de
// red/HTTP (lanza). Es crítico: un error transitorio NO debe interpretarse como
// "no hay respaldo" porque eso provocaría generar y subir una llave nueva,
// sobrescribiendo la pública del servidor y rompiendo el historial.
async function fetchKeyBackup(): Promise<KeyBackup | null> {
  const res = await fetch(`${apiBase()}/api/messages/keys/backup`, {
    headers: { ...getAuthHeader() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`No se pudo obtener el respaldo de llave (HTTP ${res.status})`);
  const data = await res.json();
  if (data?.hasBackup) {
    return {
      encryptedPrivateKey: data.encryptedPrivateKey,
      kdfSalt: data.kdfSalt,
      kdfIv: data.kdfIv,
      kdfIterations: data.kdfIterations ?? PBKDF2_ITERATIONS,
    };
  }
  return null;
}

async function uploadKeyAndBackup(publicKeyJwkStr: string, backup: KeyBackup): Promise<void> {
  const res = await fetch(`${apiBase()}/api/messages/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ publicKey: publicKeyJwkStr, ...backup }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo subir el respaldo de llave (HTTP ${res.status})`);
  }
}

// Resultado de la sincronización de llave en login/registro. Permite a la UI
// avisar al usuario cuándo sus chats no se podrán descifrar en este dispositivo.
export type KeySyncResult =
  | "kept"                  // ya había llave local utilizable; nada que hacer
  | "backup_created"        // llave local existente; se creó el respaldo cifrado
  | "restored"              // se restauró la llave desde el respaldo del servidor
  | "created"               // usuario nuevo: se generó la primera llave
  | "needs_original_device" // el servidor ya tiene una llave pero NO hay respaldo:
                            // no se puede sincronizar aquí sin romper el historial
  | "restore_failed"        // hay respaldo pero la contraseña no logró abrirlo
  | "unknown";              // fallo transitorio (red); no se pudo determinar

/**
 * Restaura o crea el par de llaves del usuario usando su contraseña (disponible
 * solo en el momento de login/registro). Reglas:
 *  - Si ya existe la llave LOCAL: la conserva, y si el servidor aún no tiene
 *    respaldo (cuenta antigua), crea el respaldo cifrado desde la llave local
 *    SIN generar una llave nueva ni sobrescribir la pública.
 *  - Si NO hay llave local pero el servidor tiene respaldo: lo recupera y lo
 *    desenvuelve con la contraseña, guardándolo localmente. NO sobrescribe la
 *    pública del servidor.
 *  - Si NO hay llave local NI respaldo PERO el servidor ya tiene una llave
 *    pública (cuenta usada en otro dispositivo antes de existir el respaldo):
 *    NO se genera una llave nueva. Generarla rotaría la pública del servidor y
 *    dejaría TODO el historial indescifrable (propio y ajeno). Se devuelve
 *    "needs_original_device" para pedir al usuario iniciar sesión primero en el
 *    dispositivo que conserva su llave original (allí se creará el respaldo).
 *  - Si NO hay llave local, NI respaldo, NI pública en el servidor (usuario
 *    realmente nuevo): genera un par nuevo y sube pública + respaldo cifrado.
 * Si existe respaldo pero la contraseña no logra desenvolverlo, se aborta sin
 * generar una llave nueva (evita romper el historial sobrescribiendo la pública).
 */
export async function restoreOrCreateKeyPair(password: string): Promise<KeySyncResult> {
  if (!password) return "unknown";

  const local = await loadLocalKeyPair();
  if (local) {
    const uid = currentUserId();
    let serverPub: JsonWebKey | null = null;
    if (uid != null) {
      invalidatePublicKeyCache(uid);
      const serverPubRaw = await fetchPublicKey(uid);
      if (serverPubRaw) {
        try {
          serverPub = JSON.parse(serverPubRaw) as JsonWebKey;
        } catch {
          return "unknown";
        }
      }
    }

    // Una llave namespaced también puede haber quedado desincronizada por una
    // versión antigua. No basta con que exista localmente: debe coincidir con la
    // pública canónica o con el respaldo cifrado que permita repararla sin rotar
    // la identidad a ciegas.
    if (serverPub && !publicKeysMatch(local.pub, serverPub)) {
      let backup: KeyBackup | null;
      try {
        backup = await fetchKeyBackup();
      } catch {
        return "unknown";
      }
      if (!backup) {
        localStorage.removeItem(nsKeyName());
        return "needs_original_device";
      }
      try {
        const backupPriv = await unwrapPrivateKey(backup, password);
        const backupPub = publicFromPrivate(backupPriv);
        await crypto.subtle.importKey(
          "jwk", backupPriv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"],
        );

        if (publicKeysMatch(backupPub, serverPub)) {
          // El servidor y el respaldo coinciden: la copia local era la divergente.
          writeLocalKeyPair(backupPub, backupPriv);
          invalidatePublicKeyCache(uid ?? undefined);
          return "restored";
        }
        if (publicKeysMatch(backupPub, local.pub)) {
          // La local y su respaldo cifrado coinciden: la pública del servidor
          // derivó en una versión antigua. El respaldo prueba qué par conservar.
          await uploadKeyAndBackup(JSON.stringify(local.pub), backup);
          invalidatePublicKeyCache(uid ?? undefined);
          return "backup_created";
        }

        // Las tres identidades discrepan. No elegir una al azar.
        localStorage.removeItem(nsKeyName());
        return "restore_failed";
      } catch {
        return "restore_failed";
      }
    }

    try {
      const existing = await fetchKeyBackup();
      if (!existing) {
        const wrapped = await wrapPrivateKey(local.priv, password);
        await uploadKeyAndBackup(JSON.stringify(local.pub), wrapped);
        return "backup_created";
      }
      // Ya hay respaldo en el servidor: verificar que siga siendo abrible con la
      // contraseña ACTUAL. Si el usuario cambió su contraseña (reset por email o
      // cambio manual) después de crear el respaldo, este quedó cifrado con la
      // contraseña vieja y sería irrecuperable en cualquier OTRO dispositivo —
      // rompiendo exactamente la continuidad "cambio de teléfono siempre
      // funciona" que se espera (estilo WhatsApp). Como este dispositivo SÍ
      // conserva la llave local intacta (no depende de la contraseña), se
      // re-envuelve y resube con la contraseña vigente para mantener el
      // respaldo siempre sincronizado.
      try {
        await unwrapPrivateKey(existing, password);
      } catch {
        const rewrapped = await wrapPrivateKey(local.priv, password);
        await uploadKeyAndBackup(JSON.stringify(local.pub), rewrapped);
        return "backup_created";
      }
    } catch {
      // best-effort: si falla, la llave local sigue siendo válida en este equipo
    }
    return "kept";
  }

  let backup: KeyBackup | null;
  try {
    backup = await fetchKeyBackup();
  } catch {
    // Fallo de red/HTTP al consultar el respaldo → abortar SIN generar una llave
    // nueva. Generar aquí sobrescribiría la pública del servidor si en realidad
    // sí existía un respaldo, rompiendo el descifrado cross-device.
    return "unknown";
  }
  if (backup) {
    try {
      const privJwk = await unwrapPrivateKey(backup, password);
      // La JWK privada P-256 contiene x,y → derivamos la pública quitando 'd'.
      const pubJwk: JsonWebKey = {
        kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, ext: true, key_ops: [],
      };
      // Validar que la privada importe correctamente antes de guardarla.
      await crypto.subtle.importKey(
        "jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]
      );
      writeLocalKeyPair(pubJwk, privJwk);
      invalidatePublicKeyCache();
      return "restored";
    } catch {
      // Contraseña incorrecta o blob inválido → NO generar nueva llave.
      return "restore_failed";
    }
  }

  // No hay respaldo. Antes de generar, comprobar si el servidor YA tiene una
  // llave pública para este usuario. Si la tiene, este dispositivo no posee la
  // llave original y no existe respaldo para recuperarla: generar una nueva
  // rotaría la pública y rompería el descifrado de todo el historial. Se aborta
  // y se pide usar el dispositivo original (que sí conserva la llave) para crear
  // el respaldo.
  const uid = currentUserId();
  if (uid != null) {
    const state = await fetchOwnPublicKeyState(uid);
    if (state === "exists") return "needs_original_device";
    // Estado incierto (sin conexión) → NO generar; evita rotar la pública por
    // un error transitorio. Se reintenta en el próximo login.
    if (state === "unknown") return "unknown";
  }

  // Sin llave local, sin respaldo y sin pública en el servidor → usuario nuevo.
  // Generar par nuevo y subir pública + respaldo cifrado.
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
  );
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  writeLocalKeyPair(pub, priv);
  try {
    const wrapped = await wrapPrivateKey(priv, password);
    await uploadKeyAndBackup(JSON.stringify(pub), wrapped);
  } catch {
    // Si falla la subida del respaldo, la llave local queda igualmente operativa.
  }
  return "created";
}
