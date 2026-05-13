import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageEvent } from "@/lib/rbac";
import { db } from "@/db";
import { signups, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

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
