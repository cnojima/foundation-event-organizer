import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { clearNotifications, clearSignupCloseNotifications } from "@/lib/notifications";
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

// Any change to one of these triggers notification re-evaluation. Signup
// window changes don't affect reminders, so they're excluded.
const NOTIFICATION_TRIGGERS: DateField[] = [
  "gameTime",
  "squad1StartsAt",
  "squad2StartsAt",
];

// Scalar (non-date) fields accepted by the edit form. `kind` is deliberately
// excluded — switching kind post-creation has cascading effects on signups
// + scrim lifecycle that this surface doesn't model. Callers who want a
// different kind delete + recreate.
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
  const guard = await canManageEvent(session, id);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  // Reject silent kind changes — see note above. Loud so it's obvious if a
  // client ever tries.
  if ("kind" in body) {
    return NextResponse.json(
      { error: "Event kind cannot be changed after creation." },
      { status: 400 }
    );
  }

  const updates: Record<string, string | number | null> = {};
  for (const field of DATE_FIELDS) {
    if (field in body) {
      const parsed = parseDateInput(body[field]);
      if (parsed === undefined) {
        return NextResponse.json(
          { error: `Invalid ${field}` },
          { status: 400 }
        );
      }
      updates[field] = parsed;
    }
  }

  for (const [field, limits] of Object.entries(STRING_FIELD_LIMITS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: `${field} must be a string` },
        { status: 400 }
      );
    }
    const trimmed = raw.trim();
    if (trimmed.length < limits.min || trimmed.length > limits.max) {
      return NextResponse.json(
        {
          error: `${field} must be ${limits.min}–${limits.max} characters.`,
        },
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
        {
          error: `${field} must be an integer in [${limits.min}, ${limits.max}].`,
        },
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

  // Reset notification state if any of the start timestamps actually moved.
  const event = guard.value.event;
  const startTimeChanged = NOTIFICATION_TRIGGERS.some(
    (f) => f in updates && updates[f] !== event[f]
  );
  if (startTimeChanged) {
    clearNotifications(id);
  }
  if ("signupCloses" in updates && updates.signupCloses !== event.signupCloses) {
    clearSignupCloseNotifications(id);
  }

  await db.update(events).set(updates).where(eq(events.id, id));

  // Two action codes for log clarity: pure date-window edits keep the
  // existing `event.dates.update` action (used today by the inline date
  // form); broader edits land under `event.update`. The audit-viewer
  // already renders both since they share the entity type.
  const changedKeys = Object.keys(updates);
  const onlyDateFields = changedKeys.every((k) =>
    (DATE_FIELDS as readonly string[]).includes(k)
  );
  const before: Record<string, string | number | null> = {};
  for (const f of changedKeys) {
    before[f] = (event as Record<string, unknown>)[f] as string | number | null;
  }
  void logAudit({
    guildId: event.guildId,
    actorUserId: guard.value.membership.userId,
    actorDisplay: await resolveActorDisplay(guard.value.membership.userId),
    action: onlyDateFields ? "event.dates.update" : "event.update",
    entityType: "event",
    entityId: event.id,
    entityLabel: event.name,
    changes: { before, after: updates },
  });

  // Only ping Discord on time changes — silent for signup-window tweaks.
  // Scrim events have their own lifecycle messages via /api/scrimmages/*.
  if (startTimeChanged && event.kind !== "scrim") {
    const merged = { ...event, ...updates };
    await sendEventNotification({
      guildId: event.guildId,
      eventId: event.id,
      eventName: event.name,
      eventKind: event.kind,
      action: "updated",
      eventUrl: `${appBaseUrlFromRequest(req)}/event/${event.id}`,
      gameTime: merged.gameTime,
      squad1Name: event.squad1Name,
      squad2Name: event.squad2Name,
      squad1StartsAt: merged.squad1StartsAt,
      squad2StartsAt: merged.squad2StartsAt,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageEvent(session, id);
  if (!guard.ok) return guard.response;
  const event = guard.value.event;

  const result = await db
    .update(events)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .returning({ id: events.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  void logAudit({
    guildId: event.guildId,
    actorUserId: guard.value.membership.userId,
    actorDisplay: await resolveActorDisplay(guard.value.membership.userId),
    action: "event.delete",
    entityType: "event",
    entityId: event.id,
    entityLabel: event.name,
  });

  // Scrim events use the scrim-cancel flow for their own notification; skip
  // the generic event-cancelled message here to avoid double-posting.
  if (event.kind !== "scrim") {
    await sendEventNotification({
      guildId: event.guildId,
      eventId: event.id,
      eventName: event.name,
      eventKind: event.kind,
      action: "cancelled",
    });
  }

  return NextResponse.json({ success: true });
}
