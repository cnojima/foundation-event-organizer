// One-time bootstrap for existing databases that were created via
// `drizzle-kit push` and don't have a __drizzle_migrations history.
//
// The first migration we generate (`0000_*.sql`) is a "baseline" that
// recreates the entire current schema from scratch. On databases that
// already have these tables, running the baseline would fail. This script
// inserts a __drizzle_migrations row marking the baseline as applied so
// the migrator skips it.
//
// Usage:
//   node scripts/db-mark-baseline-applied.mjs
//
// Honors DATABASE_PATH env var (or .env.local), falling back to
// ./data/app.db. Safe to re-run — uses INSERT OR IGNORE.

/*
One-time bootstrap on your existing DBs:


# Local
npm run db:migrate:baseline

# Test server
fly ssh console -a <test-app> -C "node scripts/db-mark-baseline-applied.mjs"

# Prod (when ready — same command)
fly ssh console -a <prod-app> -C "node scripts/db-mark-baseline-applied.mjs"
After that, every app boot auto-applies new migrations. No more fighting db:push.

Important caveat for the local DB: because we already manually applied the Phase 1 + Phase 3 columns via raw SQL earlier, the baseline 0000_baseline.sql would try to create everything from scratch on a brand-new install. On your existing local DB, run npm run db:migrate:baseline once to acknowledge "I'm already at this state." On a fresh install (no data/app.db), the migrator will run 0000_baseline.sql from scratch and create everything cleanly.

Want me to proceed to Phase 4 (result declaration + reputation feedback) now, or test the migration setup first?

*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationsFolder = path.join(repoRoot, "drizzle");

loadDotEnvLocal();

const dbPath = process.env.DATABASE_PATH ?? path.join(repoRoot, "data", "app.db");
if (!fs.existsSync(dbPath)) {
  console.error(`DB not found at ${dbPath}. Set DATABASE_PATH or run from project root.`);
  process.exit(1);
}
if (!fs.existsSync(migrationsFolder)) {
  console.error(
    `No drizzle/ folder at ${migrationsFolder}. Run \`npx drizzle-kit generate --name baseline\` first.`
  );
  process.exit(1);
}

// Find ALL migration files. We mark every existing .sql as already
// applied — the operator runs this script only when they know the DB's
// schema already matches the latest drizzle/ state (typically because it
// was kept up-to-date with `drizzle-kit push --force` before we adopted
// versioned migrations).
const sqlFiles = fs
  .readdirSync(migrationsFolder)
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (sqlFiles.length === 0) {
  console.error("No .sql files in drizzle/. Generate a baseline first.");
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Mirrors the schema Drizzle creates internally.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    hash TEXT NOT NULL,
    created_at NUMERIC
  );
`);

const insertStmt = sqlite.prepare(
  "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
);
const lookupStmt = sqlite.prepare(
  "SELECT id FROM __drizzle_migrations WHERE hash = ?"
);

let marked = 0;
let alreadyApplied = 0;
for (const file of sqlFiles) {
  const tag = file.replace(/\.sql$/, "");
  const sql = fs.readFileSync(path.join(migrationsFolder, file), "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  if (lookupStmt.get(hash)) {
    console.log(`  • ${tag}: already marked applied`);
    alreadyApplied++;
    continue;
  }
  insertStmt.run(hash, Date.now());
  console.log(`  ✓ ${tag}: marked applied (hash=${hash.slice(0, 12)}…)`);
  marked++;
}

console.log(
  `\nDone. Marked ${marked} migration(s), ${alreadyApplied} already applied.`
);
console.log(
  "Future `npm run db:migrate` runs will only execute migration files generated after this point."
);
sqlite.close();

// ---- .env.local loader (same shape as scripts/translate-messages.mjs) ----
function loadDotEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
