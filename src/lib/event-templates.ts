import { db } from "@/db";
import { eventTemplates, guilds } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";

// Pure helpers live in a sibling file so client components can import
// them without pulling in the DB module (which would bundle better-sqlite3
// into the browser and explode on `fs`).
export {
  snapSignupTime,
  isValidWeekday,
  isValidTimeUtc,
  TEMPLATE_LIMITS,
  WEEKDAY_LABELS,
} from "./event-templates-shared";

// Built-in templates seeded for every new guild. Replaces the hardcoded
// KIND_DEFAULTS that used to live in create-event-form.tsx — now admins
// can edit these (or add their own) per guild. Signup window encodes the
// canonical Monday-00:00 UTC opens / Thursday-12:00 UTC closes rhythm
// (relative to the event's weekday, computed at template-apply time).
const DEFAULT_TEMPLATES = [
  {
    templateName: "Paths to Dominance",
    eventName: "Paths to Dominance",
    description:
      "The Ascendancy Fortress is changing hands. Korell's trade throne awaits a new ruler! Seize the Ascendancy Fortress, control trade, and earn glory. Forge your legend!",
    kind: "simple" as const,
    squad1Name: "Squad 1",
    squad2Name: "Squad 2",
    maxPlayers: 20,
    maxBackups: 10,
    leadershipSlots: 3,
    signupOpensWeekday: 1,
    signupOpensTimeUtc: "00:00",
    signupClosesWeekday: 4,
    signupClosesTimeUtc: "12:00",
  },
  {
    templateName: "2-Squad Shadowfront",
    eventName: "Shadowfront",
    description:
      "Win the battle and occupy the Drifting Vaults. Lead your Guild to victory!",
    kind: "match" as const,
    squad1Name: "Squad 1",
    squad2Name: "Squad 2",
    maxPlayers: 20,
    maxBackups: 10,
    leadershipSlots: 3,
    signupOpensWeekday: 1,
    signupOpensTimeUtc: "00:00",
    signupClosesWeekday: 4,
    signupClosesTimeUtc: "12:00",
  },
];

// Insert the canonical Paths-to-Dominance + Shadowfront templates for one
// guild. Idempotent — only inserts if the guild has zero active templates.
// Returns the number of rows inserted (0 if the guild already had any).
export function seedDefaultTemplates(guildId: string): number {
  const existing = db
    .select({ id: eventTemplates.id })
    .from(eventTemplates)
    .where(eq(eventTemplates.guildId, guildId))
    .limit(1)
    .get();
  if (existing) return 0;

  const nowIso = new Date().toISOString();
  let inserted = 0;
  for (const t of DEFAULT_TEMPLATES) {
    db.insert(eventTemplates)
      .values({ ...t, guildId, createdAt: nowIso })
      .run();
    inserted++;
  }
  return inserted;
}

// Backfill for guilds created before the event_templates table existed.
// Called once at app startup after migrations apply — finds every active
// guild with no templates and seeds the defaults. Safe to call repeatedly.
export function seedDefaultTemplatesForAllGuilds(): {
  guildsScanned: number;
  guildsSeeded: number;
} {
  const allGuilds = db
    .select({ id: guilds.id })
    .from(guilds)
    .where(isNull(guilds.deletedAt))
    .all();

  let seeded = 0;
  for (const g of allGuilds) {
    if (seedDefaultTemplates(g.id) > 0) seeded++;
  }
  return { guildsScanned: allGuilds.length, guildsSeeded: seeded };
}
