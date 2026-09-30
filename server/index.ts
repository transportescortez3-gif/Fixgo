// PRIMER import: parcha console.* y arranca el buffer del visor de logs
// antes de que cualquier otro módulo escriba logs.
import "./lib/log-buffer";
import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocketIO } from "./lib/socketio";
import { runMigrations } from "./lib/migrate";
import { setMigrationsDone, setMigrationsError } from "./lib/appState";
import { warmSiteSettingsCache } from "./routes/admin";
import { startSubscriptionCron, stopSubscriptionCron } from "./lib/subscription-cron";
import { pool } from "./db";
import { purgeExpiredSecuritySelfies } from "./lib/security-selfies";
import { startAdminBlockExpiryScheduler, stopAdminBlockExpiryScheduler } from "./lib/admin-blocks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const isDev = process.env.NODE_ENV !== "production";

async function start() {
  const httpServer = http.createServer(app);
  await initSocketIO(httpServer);

  if (isDev) {
    const vite = await createViteServer({
      root,
      configFile: path.resolve(root, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const publicDir = path.resolve(__dirname, "../public");
    app.use(express.static(publicDir, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Expires", "0");
        } else if (filePath.endsWith("robots.txt") || filePath.endsWith("manifest.json") || filePath.endsWith(".svg")) {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }));
    app.get("/{*path}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      logger.info({ port }, "Fixgo server listening");
      resolve();
    });
  });

  runMigrations()
    .then(async () => {
      setMigrationsDone();
      logger.info("Migrations completed successfully");
      await warmSiteSettingsCache();
      logger.info("Site-settings cache warmed");
      await purgeExpiredSecuritySelfies();
      startAdminBlockExpiryScheduler();
      startSubscriptionCron();
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setMigrationsError(error);
      // Incluir el mensaje y el stack en el string del log para que Railway lo muestre
      logger.error(
        { err: error, stack: error.stack },
        `Migration error — server continues but DB may be incomplete: ${error.message}`,
      );
    });

  // Graceful shutdown — Railway envía SIGTERM antes de matar el contenedor
  // Esto permite que las requests en vuelo terminen antes de cerrar
  function shutdown(signal: string) {
    logger.info({ signal }, "Shutting down gracefully...");
    stopSubscriptionCron();
    stopAdminBlockExpiryScheduler();
    httpServer.close(async () => {
      try {
        await pool.end();
        logger.info("PostgreSQL pool closed");
      } catch (err) {
        logger.error({ err }, "Error closing pool");
      }
      process.exit(0);
    });

    // Si tarda más de 15s, forzar cierre (Railway espera hasta 30s)
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 15_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Capturar promesas rechazadas que no tienen .catch() en ningún handler de ruta
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise: String(promise) }, "Unhandled promise rejection — revisar handlers async sin try/catch");
  });

  // Capturar excepciones sincrónicas no manejadas (último recurso antes de crash)
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — el proceso se va a cerrar");
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
