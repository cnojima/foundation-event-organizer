import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { clearNotifications } from "@/lib/notifications";

const DATE_FIELDS = ["gameTime", "signupOpens", "signupCloses"] as const;
type DateField = (typeof DATE_FIELDS)[number];

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

  // If gameTime is moving to a different value, clear notification rows so
  // reminders fire fresh against the new time. We compare against the loaded
  // event to avoid clearing on identity-noop PATCHes.
  if ("gameTime" in updates && updates.gameTime !== guard.value.event.gameTime) {
    clearNotifications(id);
  }

  await db.update(events).set(updates).where(eq(events.id, id));
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

  const result = await db
    .update(events)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .returning({ id: events.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
