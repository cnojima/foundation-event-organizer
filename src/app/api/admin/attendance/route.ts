import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { signups, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Admin marks a walk-in / ad-hoc attendee for an event. The target user
// doesn't need to have signed up — this is for simple events (no signup
// flow), match events with last-minute walk-ins, or "forgot to sign up
// but showed up" cases. The created row carries `attendanceOnly = true`
// so reporting + UI can distinguish it from a normal signup row.
export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.eventId !== "string" || typeof body.userId !== "string") {
    return NextResponse.json(
      { error: "eventId and userId are required" },
      { status: 400 }
    );
  }

  const guard = await canManageEvent(session, body.eventId);
  if (!guard.ok) return guard.response;
  const { membership, event } = guard.value;
  if (event.deletedAt) {
    return NextResponse.json(
      { error: "Event is deleted; cannot edit attendance." },
      { status: 400 }
    );
  }

  // Target user must be a member of the event's guild — same constraint as
  // the regular signup-on-behalf flow. Super-admins still get checked
  // because attendance ties a member to a guild's historical record.
  const target = await db.query.users.findFirst({
    where: eq(users.id, body.userId),
  });
  if (!target || target.guildId !== event.guildId) {
    return NextResponse.json(
      { error: "User is not a member of this event's guild." },
      { status: 403 }
    );
  }

  // Idempotency: don't insert a duplicate active row for the same
  // (eventId, userId). If a signup row already exists (signup-bound or
  // attendance-only), flip its `attended` to true and return that row's
  // id — the admin's intent is "this person was here."
  const existing = await db.query.signups.findFirst({
    where: and(
      eq(signups.eventId, body.eventId),
      eq(signups.userId, body.userId),
      isNull(signups.deletedAt)
    ),
  });
  if (existing) {
    if (!existing.attended) {
      await db
        .update(signups)
        .set({ attended: true })
        .where(eq(signups.id, existing.id));
    }
    void logAudit({
      guildId: event.guildId,
      actorUserId: membership.userId,
      actorDisplay: await resolveActorDisplay(membership.userId),
      action: "signup.admin.attendance.add",
      entityType: "signup",
      entityId: existing.id,
      entityLabel: `${target.inGameName ?? target.name ?? target.email ?? body.userId} @ ${event.name}`,
      changes: {
        before: { attended: existing.attended },
        after: { attended: true, attendanceOnly: existing.attendanceOnly },
      },
    });
    return NextResponse.json(
      { success: true, signupId: existing.id, reused: true },
      { status: 200 }
    );
  }

  const signupId = generateId();
  await db.insert(signups).values({
    id: signupId,
    eventId: body.eventId,
    userId: body.userId,
    attended: true,
    attendanceOnly: true,
    createdAt: new Date().toISOString(),
  });

  void logAudit({
    guildId: event.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "signup.admin.attendance.add",
    entityType: "signup",
    entityId: signupId,
    entityLabel: `${target.inGameName ?? target.name ?? target.email ?? body.userId} @ ${event.name}`,
    changes: {
      after: { attended: true, attendanceOnly: true },
    },
  });

  return NextResponse.json(
    { success: true, signupId, reused: false },
    { status: 201 }
  );
}
