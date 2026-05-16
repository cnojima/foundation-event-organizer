import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { signups, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Soft-remove an ad-hoc attendance row. Only rows with `attendanceOnly =
// true` are removable here — the normal signup-row remove path is the
// soft-delete done by guild-leave/kick + the existing admin signup PATCH
// (mark unattended). Sets `deletedAt` so audit history survives.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  const signup = await db.query.signups.findFirst({
    where: eq(signups.id, id),
  });
  if (!signup) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (signup.deletedAt) {
    return NextResponse.json({ error: "Already removed" }, { status: 409 });
  }
  if (!signup.attendanceOnly) {
    // Guard rails: this endpoint is only for ad-hoc attendance rows.
    // Removing a real signup goes through the regular signup-management
    // flow (member kick, soft-delete on guild leave, etc.).
    return NextResponse.json(
      { error: "This row is a regular signup — remove it via member kick or signup admin tools." },
      { status: 400 }
    );
  }

  const guard = await canManageEvent(session, signup.eventId);
  if (!guard.ok) return guard.response;
  const { membership, event } = guard.value;

  await db
    .update(signups)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(signups.id, id));

  const target = await db.query.users.findFirst({
    where: eq(users.id, signup.userId),
    columns: { inGameName: true, name: true, email: true },
  });
  const targetDisplay =
    target?.inGameName ?? target?.name ?? target?.email ?? signup.userId;

  void logAudit({
    guildId: event.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "signup.admin.attendance.remove",
    entityType: "signup",
    entityId: signup.id,
    entityLabel: `${targetDisplay} @ ${event.name}`,
    changes: { before: { attended: signup.attended } },
  });

  return NextResponse.json({ success: true });
}
