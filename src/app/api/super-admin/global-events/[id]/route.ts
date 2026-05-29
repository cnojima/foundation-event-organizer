import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { globalEvents, events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { clearNotifications } from "@/lib/notifications";
import { sendEventNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

const DATE_FIELDS = [
  "gameTime",
  "signupOpens",
  "signupCloses",
  "squad1StartsAt",
  "squad2StartsAt",
] as const;
type DateField = (typeof DATE_FIELDS)[number];

const NOTIFICATION_TRIGGERS: DateField[] = ["gameTime", "squad1StartsAt", "squad2StartsAt"];

const STRING_FIELD_LIMITS: Record<string, { min: number; max: number }> = {
  name: { min: 1, max: 100 },
  squad1Name: { min: 1, max: 40 },
  squad2Name: { min: 1, max: 40 },
};

const NULLABLE_STRING_FIELDS = new Set(["description"]);

const INT_FIELD_LIMITS: Record<string, { min: number; max: number }> = {
  maxPlayers: { min: 1, max: 100 },
  maxBackups: { min: 0, max: 100 },
  leadershipSlots: { min: 0, max: 20 },
};

function parseDateInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const globalEvent = await db.query.globalEvents.findFirst({
    where: and(eq(globalEvents.id, id), isNull(globalEvents.deletedAt)),
  });
  if (!globalEvent) {
    return NextResponse.json({ error: "Global event not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, string | number | null> = {};

  for (const field of DATE_FIELDS) {
    if (field in body) {
      const parsed = parseDateInput(body[field]);
      if (parsed === undefined) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      updates[field] = parsed;
    }
  }

  for (const [field, limits] of Object.entries(STRING_FIELD_LIMITS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (typeof raw !== "string") {
      return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
    }
    const trimmed = raw.trim();
    if (trimmed.length < limits.min || trimmed.length > limits.max) {
      return NextResponse.json(
        { error: `${field} must be ${limits.min}–${limits.max} characters.` },
        { status: 400 }
      );
    }
    updates[field] = trimmed;
  }

  for (const field of NULLABLE_STRING_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === "") {
      updates[field] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: `${field} must be a string or null` },
        { status: 400 }
      );
    }
    updates[field] = raw.trim();
  }

  for (const [field, limits] of Object.entries(INT_FIELD_LIMITS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < limits.min || n > limits.max) {
      return NextResponse.json(
        { error: `${field} must be an integer in [${limits.min}, ${limits.max}].` },
        { status: 400 }
      );
    }
    updates[field] = n;
  }

  if ("durationMinutes" in body) {
    const raw = body.durationMinutes;
    if (raw === null || raw === "" || raw === 0) {
      updates.durationMinutes = null;
    } else {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 1440) {
        return NextResponse.json(
          { error: "durationMinutes must be an integer in [1, 1440] or null." },
          { status: 400 }
        );
      }
      updates.durationMinutes = n;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const startTimeChanged = NOTIFICATION_TRIGGERS.some(
    (f) => f in updates && updates[f] !== globalEvent[f]
  );

  await db.update(globalEvents).set(updates).where(eq(globalEvents.id, id));

  // Propagate to all non-deleted guild copies.
  const copies = await db
    .select({ id: events.id, guildId: events.guildId })
    .from(events)
    .where(and(eq(events.globalEventId, id), isNull(events.deletedAt)));

  const baseUrl = appBaseUrlFromRequest(req);
  const merged = { ...globalEvent, ...updates };

  for (const copy of copies) {
    await db.update(events).set(updates).where(eq(events.id, copy.id));

    if (startTimeChanged) {
      clearNotifications(copy.id);
      void sendEventNotification({
        guildId: copy.guildId,
        eventId: copy.id,
        eventName: (updates.name as string | undefined) ?? globalEvent.name,
        action: "updated",
        eventUrl: `${baseUrl}/event/${copy.id}`,
        gameTime: merged.gameTime ?? null,
        squad1Name: (updates.squad1Name as string | undefined) ?? globalEvent.squad1Name,
        squad2Name: (updates.squad2Name as string | undefined) ?? globalEvent.squad2Name,
        squad1StartsAt: merged.squad1StartsAt ?? null,
        squad2StartsAt: merged.squad2StartsAt ?? null,
      });
    }
  }

  const changedKeys = Object.keys(updates);
  const before: Record<string, string | number | null> = {};
  for (const f of changedKeys) {
    before[f] = (globalEvent as Record<string, unknown>)[f] as string | number | null;
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "global_event.update",
    entityType: "global_event",
    entityId: globalEvent.id,
    entityLabel: globalEvent.name,
    changes: { before, after: updates, propagatedTo: copies.length },
  });

  return NextResponse.json({ ok: true, propagatedTo: copies.length });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const globalEvent = await db.query.globalEvents.findFirst({
    where: and(eq(globalEvents.id, id), isNull(globalEvents.deletedAt)),
  });
  if (!globalEvent) {
    return NextResponse.json({ error: "Global event not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  await db.update(globalEvents).set({ deletedAt: now }).where(eq(globalEvents.id, id));

  await db
    .update(events)
    .set({ deletedAt: now })
    .where(and(eq(events.globalEventId, id), isNull(events.deletedAt)));

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "global_event.delete",
    entityType: "global_event",
    entityId: globalEvent.id,
    entityLabel: globalEvent.name,
    changes: { after: { deletedAt: now } },
  });

  return NextResponse.json({ ok: true });
}
