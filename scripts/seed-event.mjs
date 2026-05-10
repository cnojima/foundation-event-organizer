// Seed an event with synthetic users so both squads + a small waitlist are populated.
//
// Usage:
//   node scripts/seed-event.mjs              # seeds the most recently created event
//   node scripts/seed-event.mjs <eventId>    # seeds a specific event
//
// Re-runnable: any prior seed users (email ending in @seed.shadowfront.local) and
// their signups for the target event are wiped before fresh data is generated.
//
// Multi-guild note: seed users are inserted as members of the target event's guild,
// so they show up correctly in admin views (which filter by guild_id).

import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SEED_EMAIL_DOMAIN = "@seed.shadowfront.local";
const ROLES = { LEADER: "leader", PLAYER: "player", BACKUP: "backup", WAITLIST: "waitlist" };
const TARGET_LEADERS = 3;
const TARGET_BACKUPS = 10;
const WAITLIST_COUNT = 10;

const FIRST_NAMES = [
  "Ava", "Noah", "Mia", "Kai", "Zara", "Theo", "Luna", "Finn", "Ivy", "Jax",
  "Nora", "Eli", "Riya", "Owen", "Maya", "Levi", "Esme", "Beau", "Lila", "Cy",
  "Wren", "Asher", "Tess", "Rex", "Sage", "Knox", "Reese", "Oren", "Indie", "Zane",
  "Cleo", "Milo", "Sloan", "Rio", "Vesper", "Onyx", "Skye", "Bram", "Ezra", "Aris",
  "Kenji", "Aria", "Soren", "Halle", "Pax", "Vera", "Dax", "Juno", "Cass", "Quinn",
  "Roan", "Iris", "Nyx", "Ash", "Phoenix", "Lyra", "Orion", "Nova", "Echo", "Saga",
  "Kira", "Arlo", "Talia", "Ren", "Hugo", "Mira", "Jett", "Cleopatra", "Drake", "Lark",
];

const LAST_NAMES = [
  "Vance", "Holt", "Marsh", "Greer", "Avery", "Thorne", "Crane", "Wells", "Lark", "Reed",
  "Boone", "Stone", "Frost", "Quinn", "Briggs", "Vance", "Pace", "Rush", "Sloan", "West",
  "Pike", "Knox", "Ridge", "Drake", "Voss", "Mayer", "Strand", "Pierce", "Rainer", "Faye",
  "Tate", "Ash", "Locke", "Heath", "Vale", "Keene", "Rook", "Vine", "Cross", "Howe",
  "Vega", "Tower", "Park", "Fox", "Wynn", "Coen", "Hale", "Gray", "Sutton", "Mercer",
  "Trent", "Korr", "Slate", "Dane", "Orion", "Crow", "Rivers", "North", "Pyne", "Skye",
  "Vex", "Tarr", "Falk", "Onyx", "Steele", "Grimm", "Wraith", "Storm", "Hollow", "Dawn",
];

function genId() {
  return randomBytes(16).toString("hex");
}

function pickName(idx) {
  const first = FIRST_NAMES[idx % FIRST_NAMES.length];
  const last = LAST_NAMES[(idx * 7) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function bucketSquad(s) {
  if (s.assigned_role === ROLES.WAITLIST) return "waitlist";
  if (s.assigned_squad === 1 || s.assigned_squad === 2) return s.assigned_squad;
  if (s.squad1_preference === 1) return 1;
  if (s.squad2_preference === 1) return 2;
  return null;
}

function main() {
  // Honor DATABASE_PATH so the script works inside the Fly container (where
  // the DB is mounted at /data/app.db, not <cwd>/data/app.db).
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(repoRoot(), "data", "app.db");
  const db = new Database(dbPath);

  const argEventId = process.argv[2];
  const event = argEventId
    ? db.prepare("SELECT * FROM events WHERE id = ?").get(argEventId)
    : db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 1").get();

  if (!event) {
    console.error(argEventId ? `Event ${argEventId} not found.` : "No events in DB.");
    process.exit(1);
  }
  if (event.kind !== "match") {
    console.error(
      `Event ${event.id} is a "${event.kind}" event — only "match" events have signups to seed.`
    );
    process.exit(1);
  }

  console.log(`Seeding event: ${event.name} (${event.id})`);
  const squadCap = event.max_players + event.max_backups; // 30 default
  const totalSquadCap = squadCap * 2;
  console.log(`  capacity: ${totalSquadCap} (${squadCap} per squad), waitlist target: ${WAITLIST_COUNT}`);

  // Wipe prior seeds for *this guild only* so seeding event A in Guild X
  // doesn't blow away seed users for Guild Y. FK cascade on users → signups
  // takes care of the signups.
  const purged = db
    .prepare("DELETE FROM users WHERE email LIKE ? AND guild_id = ?")
    .run(`%${SEED_EMAIL_DOMAIN}`, event.guild_id).changes;
  if (purged > 0) console.log(`  purged ${purged} prior seed users in this guild`);

  const existingSignups = db
    .prepare("SELECT * FROM signups WHERE event_id = ?")
    .all(event.id);

  const counts = {
    1: { total: 0, leader: 0, backup: 0 },
    2: { total: 0, leader: 0, backup: 0 },
    waitlist: 0,
  };
  for (const s of existingSignups) {
    const bucket = bucketSquad(s);
    if (bucket === "waitlist") counts.waitlist++;
    else if (bucket === 1 || bucket === 2) {
      counts[bucket].total++;
      if (s.assigned_role === ROLES.LEADER) counts[bucket].leader++;
      if (s.assigned_role === ROLES.BACKUP) counts[bucket].backup++;
    }
  }

  console.log(
    `  existing — squad1: ${counts[1].total}/${squadCap}, squad2: ${counts[2].total}/${squadCap}, waitlist: ${counts.waitlist}`
  );

  // Plan how many fresh signups to create per bucket.
  const plan = [];
  for (const squad of [1, 2]) {
    const c = counts[squad];
    const need = Math.max(0, squadCap - c.total);
    const leadersNeeded = Math.max(0, TARGET_LEADERS - c.leader);
    const backupsNeeded = Math.max(0, TARGET_BACKUPS - c.backup);
    const playersNeeded = Math.max(0, need - leadersNeeded - backupsNeeded);

    const slots = [
      ...Array(Math.min(leadersNeeded, need)).fill(ROLES.LEADER),
      ...Array(Math.min(backupsNeeded, Math.max(0, need - leadersNeeded))).fill(ROLES.BACKUP),
      ...Array(Math.min(playersNeeded, Math.max(0, need - leadersNeeded - backupsNeeded))).fill(ROLES.PLAYER),
    ];
    for (const role of slots) plan.push({ squad, role });
  }
  for (let i = 0; i < WAITLIST_COUNT; i++) {
    plan.push({ squad: i % 2 === 0 ? 1 : 2, role: ROLES.WAITLIST });
  }

  if (plan.length === 0) {
    console.log("  squads already full — nothing to do.");
    return;
  }

  // Seed users need `in_game_name` set so they don't render as "Unknown" in
  // admin views — the app intentionally hides the OAuth `name` column for
  // PII reasons, so `displayName()` only uses in_game_name.
  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, image, in_game_name, guild_id, guild_role) VALUES (?, ?, ?, NULL, ?, ?, 'member')"
  );
  const insertSignup = db.prepare(`
    INSERT INTO signups (
      id, event_id, user_id,
      squad1_preference, squad2_preference,
      willing_backup, request_leadership, leadership_note,
      attended, rating, admin_notes,
      assigned_squad, assigned_role,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    let added = 0;
    let nameIdx = 0;
    for (const { squad, role } of plan) {
      const userId = genId();
      const signupId = genId();
      const name = pickName(nameIdx++);
      const email = `${userId.slice(0, 12)}${SEED_EMAIL_DOMAIN}`;
      insertUser.run(userId, name, email, name, event.guild_id);

      const squad1Pref = squad === 1 ? 1 : 2;
      const squad2Pref = squad === 1 ? 2 : 1;
      const willingBackup = role === ROLES.BACKUP || role === ROLES.PLAYER ? 1 : 0;
      const requestLeadership = role === ROLES.LEADER ? 1 : 0;
      const assignedSquad = role === ROLES.WAITLIST ? null : squad;
      const assignedRole = role;
      // Stagger createdAt so the waitlist has a stable order.
      const createdAt = new Date(Date.now() - (plan.length - added) * 1000).toISOString();

      insertSignup.run(
        signupId,
        event.id,
        userId,
        squad1Pref,
        squad2Pref,
        willingBackup,
        requestLeadership,
        assignedSquad,
        assignedRole,
        createdAt
      );
      added++;
    }
    return added;
  });

  const added = txn();

  // Summarize.
  const finalCount = db
    .prepare("SELECT COUNT(*) as c FROM signups WHERE event_id = ?")
    .get(event.id).c;
  const wlCount = db
    .prepare("SELECT COUNT(*) as c FROM signups WHERE event_id = ? AND assigned_role = ?")
    .get(event.id, ROLES.WAITLIST).c;

  console.log(`  added ${added} signups`);
  console.log(`  total signups now: ${finalCount} (${wlCount} waitlisted)`);
}

main();
