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
    // Disable FK enforcement for the duration of migrations. Drizzle's
    // SQLite migrator wraps each migration file in a BEGIN/COMMIT, and
    // `PRAGMA foreign_keys` is a no-op inside a transaction — so the
    // `PRAGMA foreign_keys=OFF` baked into Drizzle-Kit's rebuild migrations
    // never actually applies. Without this connection-level toggle, any
    // table-recreation migration (the SQLite "create __new_X, copy, drop
    // old, rename" pattern Drizzle emits for FK or column changes) fires
    // cascades on the DROP and silently wipes child rows in referring
    // tables (events, signups, scrim_proposals, guild_invites, …) and
    // nulls FK columns in others (users.guild_id). Set BEFORE migrate()
    // because pragmas are per-connection. See: https://www.sqlite.org/foreignkeys.html
    sqlite.pragma("foreign_keys = OFF");
    const db = drizzle(sqlite);
    drizzleMigrate(db, { migrationsFolder });
  } finally {
    sqlite.close();
  }
}
