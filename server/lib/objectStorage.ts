import { createWriteStream, existsSync, mkdirSync } from "fs";
import { readFileSync } from "fs";
import { stat, readFile, writeFile, unlink } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import path from "path";
import { randomUUID } from "crypto";

export class PersistentUploadStorageUnavailableError extends Error {
  constructor(message = "El volumen persistente de archivos no está montado en el servicio de la API.") {
    super(message);
    this.name = "PersistentUploadStorageUnavailableError";
    Object.setPrototypeOf(this, PersistentUploadStorageUnavailableError.prototype);
  }
}

function hasPersistentMountFor(targetDir: string): boolean {
  try {
    const target = path.resolve(targetDir);
    const mountPoints = readFileSync("/proc/self/mountinfo", "utf-8")
      .split("\n")
      .map((line) => line.split(" - ", 1)[0]?.split(" ")[4])
      .filter((mountPoint): mountPoint is string => Boolean(mountPoint))
      .map((mountPoint) => mountPoint.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
        String.fromCharCode(parseInt(octal, 8)),
      ));

    return mountPoints.some((mountPoint) =>
      mountPoint !== "/" &&
      (target === mountPoint || target.startsWith(`${mountPoint.replace(/\/+$/, "")}/`)),
    );
  } catch {
    return false;
  }
}

function getUploadDir(): string {
  // En produccion (Railway) se usa el volumen persistente montado en /data.
  // En desarrollo local se usa la carpeta uploads/ del proyecto.
  // Siempre se puede sobreescribir con la variable UPLOAD_DIR.
  const defaultDir =
    process.env.NODE_ENV === "production"
      ? "/data/uploads"
      : path.join(process.cwd(), "uploads");
  const dir = process.env.UPLOAD_DIR || defaultDir;
  if (process.env.NODE_ENV === "production" && !hasPersistentMountFor(dir)) {
    throw new PersistentUploadStorageUnavailableError(
      `No se encontró un volumen persistente que cubra ${dir}. En Railway, monta un volumen en el servicio de la API (por ejemplo, /data) o configura UPLOAD_DIR dentro de ese volumen.`,
    );
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getServerUrl(): string {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 8081}`).replace(/\/$/, "");
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    // Do not hand out upload URLs that would write to a disposable container
    // filesystem in production.
    getUploadDir();
    const id = randomUUID();
    const serverUrl = getServerUrl();
    return `${serverUrl}/api/storage/uploads/${id}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const match = url.pathname.match(/\/api\/storage\/uploads\/([^/?]+)/);
      if (match) {
        return `uploads/${match[1]}`;
      }
      return url.pathname;
    } catch {
      return rawPath;
    }
  }

  async saveUploadedFile(id: string, data: Buffer, contentType: string): Promise<void> {
    const uploadDir = getUploadDir();
    const filePath = path.join(uploadDir, id);
    await writeFile(filePath, data);
    await writeFile(`${filePath}.meta`, contentType, "utf-8");
  }

  async deleteObjectEntity(rawPath: string): Promise<void> {
    const normalized = this.normalizeObjectEntityPath(rawPath).replace(/^\/+/, "");
    if (!/^uploads\/[0-9a-f-]{36}$/.test(normalized)) {
      throw new Error("Invalid object path");
    }
    const id = normalized.slice("uploads/".length);
    const filePath = path.join(getUploadDir(), id);
    await Promise.all([
      unlink(filePath).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      }),
      unlink(`${filePath}.meta`).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      }),
    ]);
  }

  async getObjectEntityFile(objectPath: string): Promise<{ filePath: string; contentType: string }> {
    if (!objectPath.startsWith("/objects/uploads/")) {
      throw new ObjectNotFoundError();
    }

    const id = objectPath.slice("/objects/uploads/".length);
    if (!id || id.includes("..") || id.includes("/")) {
      throw new ObjectNotFoundError();
    }

    const uploadDir = getUploadDir();
    const filePath = path.join(uploadDir, id);

    if (!existsSync(filePath)) {
      throw new ObjectNotFoundError();
    }

    let contentType = "application/octet-stream";
    try {
      contentType = (await readFile(`${filePath}.meta`, "utf-8")).trim();
    } catch {}

    return { filePath, contentType };
  }

  async downloadObject(file: { filePath: string; contentType: string }): Promise<Response> {
    const { filePath, contentType } = file;
    const stats = await stat(filePath);
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stats.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  async searchPublicObject(_filePath: string): Promise<null> {
    return null;
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
  }

  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }
}
