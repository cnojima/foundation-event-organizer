import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator";

// Applies pending migrations from /drizzle to the DB at DATABASE_PATH (or
// ./data/app.db locally). Idempotent — Drizzle's migrator records applied
// migrations in `__drizzle_migrations` and skips them on subsequent runs.
//
// Called once at app startup from instrumentation-node.ts. Also exposed via
// `npm run db:migrate` for explicit local invocation.
//
// Opens its own short-lived connection rather than reusing src/db/index.ts's
// singleton — migrations should run before any application query, and using
// a fresh connection avoids any pragma/WAL state surprises with concurrent
// readers during startup.
export function runMigrations(): void {
  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("journal_mode = WAL");
    const db = drizzle(sqlite);
    drizzleMigrate(db, { migrationsFolder });
  } finally {
    sqlite.close();
  }
}
