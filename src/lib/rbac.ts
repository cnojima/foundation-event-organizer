import { db } from "@/db";
import {
  events,
  guilds,
  users,
  migrationDestinations,
  migrationOfficers,
  migrationApplications,
} from "@/db/schema";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

export type GuildRole = "admin" | "member";

export type Membership = {
  userId: string;
  guildId: string | null;
  guildSlug: string | null;
  guildRole: GuildRole | null;
  isSuperAdmin: boolean;
};

export const RESERVED_SLUGS = [
  "new",
  "admin",
  "super-admin",
  "api",
  "auth",
  "join",
  "guilds",
];

export function isValidSlug(slug: string): boolean {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return false;
  if (RESERVED_SLUGS.includes(slug)) return false;
  return true;
}

export function getMembership(session: Session | null): Membership | null {
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    guildId: session.user.guildId ?? null,
    guildSlug: session.user.guildSlug ?? null,
    guildRole: session.user.guildRole ?? null,
    isSuperAdmin: session.user.isSuperAdmin === true,
  };
}

// ---- Page guards (redirect on failure) ----

export function requireSignedInPage(session: Session | null): Membership {
  const m = getMembership(session);
  if (!m) redirect("/signin");
  return m;
}

export function requireAnyGuildPage(session: Session | null): Membership {
  const m = requireSignedInPage(session);
  if (!m.guildId) redirect("/guilds");
  return m;
}

export function requireGuildAdminPage(
  session: Session | null,
  guildId?: string
): Membership {
  const m = requireSignedInPage(session);
  const targetGuildId = guildId ?? m.guildId;
  if (!targetGuildId) redirect("/guilds");
  if (m.isSuperAdmin) return m;
  if (m.guildRole === "admin" && m.guildId === targetGuildId) return m;
  redirect("/");
}

export function requireSuperAdminPage(session: Session | null): Membership {
  const m = requireSignedInPage(session);
  if (!m.isSuperAdmin) redirect("/");
  return m;
}

// ---- API guards (return-or-respond) ----

type ApiResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

function apiForbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function apiUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function requireSignedInApi(session: Session | null): ApiResult<Membership> {
  const m = getMembership(session);
  if (!m) return { ok: false, response: apiUnauthorized() };
  return { ok: true, value: m };
}

export function requireGuildAdminApi(
  session: Session | null,
  guildId?: string
): ApiResult<Membership> {
  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  const m = r.value;
  const targetGuildId = guildId ?? m.guildId;
  if (!targetGuildId) return { ok: false, response: apiForbidden() };
  if (m.isSuperAdmin) return { ok: true, value: m };
  if (m.guildRole === "admin" && m.guildId === targetGuildId) {
    return { ok: true, value: m };
  }
  return { ok: false, response: apiForbidden() };
}

export function requireSuperAdminApi(session: Session | null): ApiResult<Membership> {
  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  if (!r.value.isSuperAdmin) return { ok: false, response: apiForbidden() };
  return r;
}

// ---- Migration tracker: server-scoped (not guild-scoped) admin access ----
//
// A destination is a game server, not an app guild — a server can host
// several app guilds at once (see migrationDestinations in schema.ts), so
// "admin of guild X" doesn't apply. Instead: any admin of ANY guild whose
// own serverNumber matches the destination's serverNumber may manage it.
// Super-admins always pass, same bypass convention as every other guard.

export async function requireServerAdminApi(
  session: Session | null,
  serverNumber: number
): Promise<ApiResult<Membership>> {
  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  const m = r.value;
  if (m.isSuperAdmin) return { ok: true, value: m };
  if (m.guildRole !== "admin" || !m.guildId) return { ok: false, response: apiForbidden() };
  const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, m.guildId) });
  if (!guild || guild.serverNumber !== serverNumber) {
    return { ok: false, response: apiForbidden() };
  }
  return { ok: true, value: m };
}

export async function requireServerAdminPage(
  session: Session | null,
  serverNumber: number
): Promise<Membership> {
  const m = requireSignedInPage(session);
  if (m.isSuperAdmin) return m;
  if (m.guildRole !== "admin" || !m.guildId) redirect("/");
  const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, m.guildId) });
  if (!guild || guild.serverNumber !== serverNumber) redirect("/");
  return m;
}

type MigrationDestinationRow = typeof migrationDestinations.$inferSelect;

// Resource-aware: loads the destination, then applies the same "admin of a
// guild on this server" check as requireServerAdminApi.
export async function canManageMigrationDestination(
  session: Session | null,
  destinationId: string
): Promise<ApiResult<{ membership: Membership; destination: MigrationDestinationRow }>> {
  const destination = await db.query.migrationDestinations.findFirst({
    where: eq(migrationDestinations.id, destinationId),
  });
  if (!destination) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Destination not found" }, { status: 404 }),
    };
  }
  const guard = await requireServerAdminApi(session, destination.serverNumber);
  if (!guard.ok) return guard;
  return { ok: true, value: { membership: guard.value, destination } };
}

type MigrationApplicationRow = typeof migrationApplications.$inferSelect;

// Resource-aware: loads the destination, then passes if the caller can
// manage it (server-admin/super-admin) OR is an assigned officer for it.
// `isServerAdmin` lets callers gate server-admin-only actions (like the
// data-hygiene "remove", or Officers/Settings pages) without a second query.
export async function canReviewMigrationDestination(
  session: Session | null,
  destinationId: string
): Promise<
  ApiResult<{
    membership: Membership;
    destination: MigrationDestinationRow;
    isServerAdmin: boolean;
  }>
> {
  const destination = await db.query.migrationDestinations.findFirst({
    where: eq(migrationDestinations.id, destinationId),
  });
  if (!destination) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Destination not found" }, { status: 404 }),
    };
  }

  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  const m = r.value;

  const adminGuard = await requireServerAdminApi(session, destination.serverNumber);
  if (adminGuard.ok) {
    return { ok: true, value: { membership: m, destination, isServerAdmin: true } };
  }

  const officer = await db.query.migrationOfficers.findFirst({
    where: and(
      eq(migrationOfficers.destinationId, destination.id),
      eq(migrationOfficers.userId, m.userId)
    ),
  });
  if (officer) {
    return { ok: true, value: { membership: m, destination, isServerAdmin: false } };
  }

  return { ok: false, response: apiForbidden() };
}

// Page variant of canReviewMigrationDestination — redirects instead of
// returning a NextResponse.
export async function requireMigrationDestinationReviewPage(
  session: Session | null,
  destinationId: string
): Promise<{ membership: Membership; destination: MigrationDestinationRow; isServerAdmin: boolean }> {
  const m = requireSignedInPage(session);
  const destination = await db.query.migrationDestinations.findFirst({
    where: eq(migrationDestinations.id, destinationId),
  });
  if (!destination) redirect("/admin/migration-tracker");

  if (m.isSuperAdmin) return { membership: m, destination, isServerAdmin: true };

  if (m.guildRole === "admin" && m.guildId) {
    const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, m.guildId) });
    if (guild && guild.serverNumber === destination.serverNumber) {
      return { membership: m, destination, isServerAdmin: true };
    }
  }

  const officer = await db.query.migrationOfficers.findFirst({
    where: and(
      eq(migrationOfficers.destinationId, destination.id),
      eq(migrationOfficers.userId, m.userId)
    ),
  });
  if (officer) return { membership: m, destination, isServerAdmin: false };

  redirect("/");
}

// Resource-aware: loads the application -> its destination, then applies
// canReviewMigrationDestination.
export async function canReviewMigrationApplication(
  session: Session | null,
  applicationId: string
): Promise<
  ApiResult<{
    membership: Membership;
    destination: MigrationDestinationRow;
    application: MigrationApplicationRow;
    isServerAdmin: boolean;
  }>
> {
  const application = await db.query.migrationApplications.findFirst({
    where: eq(migrationApplications.id, applicationId),
  });
  if (!application) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Application not found" }, { status: 404 }),
    };
  }
  const guard = await canReviewMigrationDestination(session, application.destinationId);
  if (!guard.ok) return guard;
  return { ok: true, value: { ...guard.value, application } };
}

// ---- Resource-aware checks ----

type EventRow = typeof events.$inferSelect;

export async function canManageEvent(
  session: Session | null,
  eventId: string
): Promise<ApiResult<{ membership: Membership; event: EventRow }>> {
  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  const m = r.value;
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  }
  if (m.isSuperAdmin) return { ok: true, value: { membership: m, event } };
  if (m.guildRole === "admin" && m.guildId === event.guildId) {
    return { ok: true, value: { membership: m, event } };
  }
  return { ok: false, response: apiForbidden() };
}

export async function canViewEvent(
  session: Session | null,
  eventId: string
): Promise<ApiResult<{ membership: Membership; event: EventRow }>> {
  const r = requireSignedInApi(session);
  if (!r.ok) return r;
  const m = r.value;
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  }
  if (m.isSuperAdmin) return { ok: true, value: { membership: m, event } };
  if (m.guildId && m.guildId === event.guildId) {
    return { ok: true, value: { membership: m, event } };
  }
  return { ok: false, response: apiForbidden() };
}

// ---- Resolve effective admin guild from URL/session (for super-admin "Acting as") ----

// Returns the guildId an admin should operate against, given an optional ?guildId=
// query param. Super-admins may target any guild. Regular guild admins are pinned
// to their own guild — passing a different guildId is rejected (returns null).
export async function resolveAdminGuildId(
  membership: Membership,
  requestedGuildId: string | undefined
): Promise<string | null> {
  if (!requestedGuildId || requestedGuildId === membership.guildId) {
    return membership.guildId;
  }
  if (!membership.isSuperAdmin) return null;
  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, requestedGuildId),
  });
  return guild ? guild.id : null;
}

// ---- Invite usability ----

export type InviteUsableShape = {
  revokedAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  usesCount: number;
};

export function isInviteUsable(invite: InviteUsableShape): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return false;
  }
  if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) return false;
  return true;
}

// ---- Last-admin guard ----

export async function countGuildAdmins(guildId: string): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.guildId, guildId), eq(users.guildRole, "admin")))
    .get();
  return Number(row?.count ?? 0);
}

// Total live members in a guild (any role).
export async function countGuildMembers(guildId: string): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.guildId, guildId))
    .get();
  return Number(row?.count ?? 0);
}

// Soft-deletes a guild and its active events. Doesn't touch the users table —
// callers (leave, account delete, super-admin delete) handle user detachment
// independently so they can wrap it in their own transaction. The `tx` arg
// accepts either a transaction handle or the bare `db` so this composes both
// inside and outside transactions.
type DbExec = {
  update: typeof db.update;
};
export function softDeleteGuildAndEvents(
  tx: DbExec,
  guildId: string,
  nowIso: string = new Date().toISOString()
): void {
  tx.update(guilds).set({ deletedAt: nowIso }).where(eq(guilds.id, guildId)).run();
  tx.update(events)
    .set({ deletedAt: nowIso })
    .where(and(eq(events.guildId, guildId), isNull(events.deletedAt)))
    .run();
}

// ---- Slug utilities ----

export async function isSlugTaken(slug: string): Promise<boolean> {
  const existing = await db.query.guilds.findFirst({
    where: and(eq(guilds.slug, slug), isNull(guilds.deletedAt)),
  });
  return !!existing;
}
