import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,                    // 50 conexiones simultáneas (default era 10)
  min: 5,                     // Mantiene 5 conexiones siempre abiertas (warmup)
  idleTimeoutMillis: 30_000,  // Libera conexiones inactivas después de 30s
  connectionTimeoutMillis: 5_000, // Error rápido si no hay conexión en 5s
  keepAlive: true,            // TCP keepalive para conexiones largas
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
