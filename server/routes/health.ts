import { Router, type IRouter } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { migrationsDone, migrationsError } from "../lib/appState";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbStatus = "connected";
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown";
  }

  res.status(200).json({
    status: dbStatus === "connected" ? (migrationsDone ? "ok" : "starting") : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    migrations: {
      done: migrationsDone,
      error: migrationsError ? migrationsError.message : null,
    },
    db: {
      status: dbStatus,
      ...(dbLatencyMs !== null && { latencyMs: dbLatencyMs }),
      ...(dbError && { error: dbError }),
    },
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

export default router;
