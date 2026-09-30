import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import pg from "pg";
import { logger } from "./logger";

const { Pool } = pg;

const MIGRATION_LOCK_ID = 987654321;

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id         SERIAL PRIMARY KEY,
          filename   TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const migrationsDir = path.resolve(process.cwd(), "migrations");

      if (!existsSync(migrationsDir)) {
        logger.info("No migrations directory found, skipping");
        return;
      }

      const files = (await readdir(migrationsDir))
        .filter(f => f.endsWith(".sql"))
        .sort();

      if (files.length === 0) {
        logger.info("No migration files found");
        return;
      }

      const { rows: applied } = await pool.query<{ filename: string }>(
        "SELECT filename FROM _migrations ORDER BY filename"
      );
      const appliedSet = new Set(applied.map(r => r.filename));

      const pending = files.filter(f => !appliedSet.has(f));

      if (pending.length === 0) {
        logger.info("All migrations already applied");
        return;
      }

      logger.info({ count: pending.length }, "Running pending migrations");

      for (const filename of pending) {
        const filePath = path.join(migrationsDir, filename);
        const sql = await readFile(filePath, "utf-8");

        logger.info({ filename }, "Applying migration");

        await pool.query("BEGIN");
        try {
          await pool.query(sql);
          await pool.query(
            "INSERT INTO _migrations (filename) VALUES ($1)",
            [filename]
          );
          await pool.query("COMMIT");
          logger.info({ filename }, "Migration applied successfully");
        } catch (err) {
          await pool.query("ROLLBACK");
          throw new Error(`Migration ${filename} failed: ${err}`);
        }
      }

      logger.info("All migrations completed");
    } finally {
      await pool.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
