// Toggle is_super_admin on a user. Sign in via OAuth at least once first
// so the user row exists.
//
// Usage:
//   node scripts/promote-super-admin.mjs <email>           # promote
//   node scripts/promote-super-admin.mjs <email> --demote  # demote
//   fly ssh console -C "node /app/scripts/promote-super-admin.mjs <email>"

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function main() {
  const email = process.argv[2];
  const demote = process.argv.includes("--demote");

  if (!email) {
    console.error("Usage: node scripts/promote-super-admin.mjs <email> [--demote]");
    process.exit(1);
  }

  const dbPath =
    process.env.DATABASE_PATH ?? path.join(repoRoot(), "data", "app.db");
  const db = new Database(dbPath);

  const user = db
    .prepare("SELECT id, name, is_super_admin FROM users WHERE email = ?")
    .get(email);

  if (!user) {
    console.error(
      `No user found with email ${email}.\nSign in via OAuth at least once first, then re-run this command.`
    );
    process.exit(1);
  }

  const next = demote ? 0 : 1;
  if (user.is_super_admin === next) {
    console.log(
      `${email} is already ${next ? "a super-admin" : "not a super-admin"}. Nothing to do.`
    );
    return;
  }

  db.prepare("UPDATE users SET is_super_admin = ? WHERE id = ?").run(next, user.id);
  console.log(
    `${demote ? "Demoted" : "Promoted"} ${email} (${user.name ?? "no name"}). Sign out and back in for the session to refresh.`
  );
}

main();
