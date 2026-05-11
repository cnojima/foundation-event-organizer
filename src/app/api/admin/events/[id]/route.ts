import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { clearNotifications } from "@/lib/notifications";
import { sendEventNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";

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
  const updates: Partial<Record<DateField, string | null>> = {};
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

  await db.update(events).set(updates).where(eq(events.id, id));

  // Only ping Discord on time changes — silent for signup-window tweaks.
  // Scrim events have their own lifecycle messages via /api/scrimmages/*.
  if (startTimeChanged && event.kind !== "scrim") {
    const merged = { ...event, ...updates };
    await sendEventNotification({
      guildId: event.guildId,
      eventId: event.id,
      eventName: event.name,
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

  // Scrim events use the scrim-cancel flow for their own notification; skip
  // the generic event-cancelled message here to avoid double-posting.
  if (event.kind !== "scrim") {
    await sendEventNotification({
      guildId: event.guildId,
      eventId: event.id,
      eventName: event.name,
      action: "cancelled",
    });
  }

  return NextResponse.json({ success: true });
}
