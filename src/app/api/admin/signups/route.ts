import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { signups, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";
import { createSignup } from "@/lib/signups";

// Admin signs up another player on their behalf. Same shape as the
// self-signup body except it carries `userId` (the target) and is
// gated on canManageEvent — guild admin of the event's guild, or
// super-admin. createSignup() still validates target.guildId ==
// event.guildId so admins can't roster outsiders.
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

  const result = createSignup({
    membership,
    input: {
      eventId: body.eventId,
      userId: body.userId,
      squad1Preference:
        typeof body.squad1Preference === "number" ? body.squad1Preference : null,
      squad2Preference:
        typeof body.squad2Preference === "number" ? body.squad2Preference : null,
      willingBackup: !!body.willingBackup,
      requestLeadership: !!body.requestLeadership,
      leadershipNote:
        typeof body.leadershipNote === "string" && body.leadershipNote !== ""
          ? body.leadershipNote
          : null,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, body.userId),
    columns: { inGameName: true, name: true, email: true },
  });
  const targetDisplay =
    target?.inGameName ?? target?.name ?? target?.email ?? body.userId;

  void logAudit({
    guildId: event.guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "signup.admin.create",
    entityType: "signup",
    entityId: result.signupId,
    entityLabel: `${targetDisplay} @ ${event.name}`,
    changes: {
      after: {
        targetUserId: body.userId,
        squad1Preference: body.squad1Preference ?? null,
        squad2Preference: body.squad2Preference ?? null,
        willingBackup: !!body.willingBackup,
        requestLeadership: !!body.requestLeadership,
        waitlisted: result.waitlisted,
      },
    },
  });

  return NextResponse.json(
    { success: true, waitlisted: result.waitlisted, signupId: result.signupId },
    { status: 201 }
  );
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing signup id" }, { status: 400 });
  }

  const signup = await db.query.signups.findFirst({ where: eq(signups.id, id) });
  if (!signup) {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  const guard = await canManageEvent(session, signup.eventId);
  if (!guard.ok) return guard.response;

  const allowedFields: Record<string, unknown> = {};
  if ("attended" in updates) allowedFields.attended = updates.attended;
  if ("rating" in updates) allowedFields.rating = updates.rating;
  if ("adminNotes" in updates) allowedFields.adminNotes = updates.adminNotes;
  if ("assignedSquad" in updates) allowedFields.assignedSquad = updates.assignedSquad;
  if ("assignedRole" in updates) allowedFields.assignedRole = updates.assignedRole;

  await db.update(signups).set(allowedFields).where(eq(signups.id, id));

  const target = await db.query.users.findFirst({
    where: eq(users.id, signup.userId),
    columns: { inGameName: true, name: true },
  });
  void logAudit({
    guildId: guard.value.event.guildId,
    actorUserId: guard.value.membership.userId,
    actorDisplay: await resolveActorDisplay(guard.value.membership.userId),
    action: "signup.admin.update",
    entityType: "signup",
    entityId: signup.id,
    entityLabel: `${target?.inGameName ?? target?.name ?? signup.userId} @ ${guard.value.event.name}`,
    changes: { after: allowedFields },
  });

  return NextResponse.json({ success: true });
}
