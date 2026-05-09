import { db } from "@/db";
import { events, guilds, users } from "@/db/schema";
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
  if (!m) redirect("/api/auth/signin");
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

// ---- Slug utilities ----

export async function isSlugTaken(slug: string): Promise<boolean> {
  const existing = await db.query.guilds.findFirst({
    where: and(eq(guilds.slug, slug), isNull(guilds.deletedAt)),
  });
  return !!existing;
}
