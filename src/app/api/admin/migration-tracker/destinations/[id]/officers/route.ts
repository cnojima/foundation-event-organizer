import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { isWindowClosed } from "@/lib/migration-tracker";
import { db } from "@/db";
import { migrationOfficers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;

  const officers = await db
    .select({
      userId: migrationOfficers.userId,
      createdAt: migrationOfficers.createdAt,
      name: users.name,
      username: users.username,
      discordUserId: users.discordUserId,
    })
    .from(migrationOfficers)
    .innerJoin(users, eq(users.id, migrationOfficers.userId))
    .where(eq(migrationOfficers.destinationId, id));

  return NextResponse.json({ officers });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;
  const { membership, destination } = guard.value;
  if (isWindowClosed(destination)) {
    return NextResponse.json({ error: "This migration window has closed" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, body.userId) });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await db.query.migrationOfficers.findFirst({
    where: and(eq(migrationOfficers.destinationId, id), eq(migrationOfficers.userId, body.userId)),
  });
  if (existing) {
    return NextResponse.json({ error: "Already an officer" }, { status: 409 });
  }

  await db.insert(migrationOfficers).values({
    destinationId: id,
    userId: body.userId,
    assignedByUserId: membership.userId,
    createdAt: new Date().toISOString(),
  });

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.officer.assign",
    entityType: "migration_officer",
    entityId: body.userId,
    entityLabel: targetUser.inGameName ?? targetUser.name ?? targetUser.username ?? body.userId,
    changes: { destinationId: id },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
