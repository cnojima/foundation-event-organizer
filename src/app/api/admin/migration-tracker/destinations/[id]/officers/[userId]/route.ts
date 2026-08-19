import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { isWindowClosed } from "@/lib/migration-tracker";
import { db } from "@/db";
import { migrationOfficers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;
  const { membership, destination } = guard.value;
  if (isWindowClosed(destination)) {
    return NextResponse.json({ error: "This migration window has closed" }, { status: 409 });
  }

  const existing = await db.query.migrationOfficers.findFirst({
    where: and(eq(migrationOfficers.destinationId, id), eq(migrationOfficers.userId, userId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not an officer" }, { status: 404 });
  }

  await db
    .delete(migrationOfficers)
    .where(and(eq(migrationOfficers.destinationId, id), eq(migrationOfficers.userId, userId)));

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.officer.revoke",
    entityType: "migration_officer",
    entityId: userId,
    entityLabel: targetUser?.inGameName ?? targetUser?.name ?? targetUser?.username ?? userId,
    changes: { destinationId: id },
  });

  return NextResponse.json({ success: true });
}
