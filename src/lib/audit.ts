import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Stable, dot-namespaced action key. New keys can be added at will — the
// UI maps unknown keys to a generic "action.unknown" label, so adding a
// row in the helper is enough to ship a new entry.
export type AuditAction =
  // Events
  | "event.create"
  | "event.update"
  | "event.dates.update"
  | "event.delete"
  // Signups
  | "signup.create"
  | "signup.update"
  | "signup.admin.create"
  | "signup.admin.update"
  | "signup.admin.attendance.add"
  | "signup.admin.attendance.remove"
  | "signup.delete"
  // Members
  | "member.promote"
  | "member.demote"
  | "member.kick"
  | "member.leave"
  | "member.join"
  | "member.stub_create"
  | "member.stub_claim"
  // Invites
  | "invite.create"
  | "invite.revoke"
  // Guild
  | "guild.create"
  | "guild.update"
  | "guild.discord.test"
  // Scrims
  | "scrim.propose"
  | "scrim.update"
  | "scrim.accept"
  | "scrim.decline"
  | "scrim.withdraw"
  | "scrim.cancel"
  | "scrim.result"
  // Duels
  | "duel.propose"
  | "duel.update"
  | "duel.accept"
  | "duel.decline"
  | "duel.withdraw"
  | "duel.cancel"
  | "duel.result"
  | "duel.feedback"
  // User / super-admin
  | "user.update"
  | "user.super_admin.update"
  | "guild.super_admin.delete"
  | "guild.super_admin.restore"
  // Bot
  | "bot.poll_now"
  // Event templates
  | "event_template.create"
  | "event_template.update"
  | "event_template.delete"
  // Global events (super-admin, guildId: null)
  | "global_event.create"
  | "global_event.update"
  | "global_event.delete"
  // Migration tracker (server-scoped, not guild-scoped — guildId: null)
  | "migration.submit"
  | "migration.import"
  | "migration.edit"
  | "migration.withdraw"
  | "migration.accept"
  | "migration.deny"
  | "migration.waitlist"
  | "migration.remove"
  | "migration.officer.assign"
  | "migration.officer.revoke"
  | "migration.destination.reclassify"
  | "migration.destination.allocations.update"
  | "migration.destination.create"
  | "migration.destination.dates.update"
  | "migration.thresholds.update";

export type AuditEntityType =
  | "event"
  | "signup"
  | "member"
  | "invite"
  | "guild"
  | "scrim"
  | "duel"
  | "user"
  | "bot"
  | "event_template"
  | "global_event"
  | "migration_application"
  | "migration_destination"
  | "migration_officer";

export type AuditChange = Record<string, unknown>;

export type LogAuditInput = {
  // Null when the action isn't tied to any single guild (super-admin
  // promotions, etc). Per-guild admins won't see those rows.
  guildId: string | null;
  actorUserId: string | null;
  // Snapshot for display — survives user deletion / rename. Pass the
  // in-game name at action time, or "(system)" for automated actors.
  actorDisplay: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  // Human-readable label for the affected row (e.g. event name, member
  // in-game name). Captured at write time so the log doesn't go vague
  // after a rename.
  entityLabel?: string | null;
  // Pass only the fields that changed — { before: {...}, after: {...} }
  // is the canonical shape but anything serializable works.
  changes?: { before?: AuditChange; after?: AuditChange } | AuditChange | null;
};

// Best-effort write. Wrapped in try/catch — a failure here MUST NOT roll
// back the caller's mutation. The audit log is observability; if the
// SQLite write fails, log to console and move on.
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      guildId: input.guildId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorDisplay: input.actorDisplay,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      changes: input.changes ? JSON.stringify(input.changes) : null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[audit] insert failed:", err, "input:", input);
  }
}

// Common shorthand — most callers have a session and want to resolve the
// actor's display name. Looks up the user once; falls back to the email
// from the session or a placeholder if everything is missing.
export async function resolveActorDisplay(
  userId: string | null | undefined
): Promise<string> {
  if (!userId) return "(anonymous)";
  try {
    const u = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { inGameName: true, name: true, email: true },
    });
    return u?.inGameName ?? u?.name ?? u?.email ?? userId;
  } catch {
    return userId;
  }
}
