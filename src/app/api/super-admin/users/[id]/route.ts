import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  if (typeof body.isSuperAdmin !== "boolean") {
    return NextResponse.json({ error: "Missing isSuperAdmin" }, { status: 400 });
  }

  // Don't let the last super-admin demote themselves.
  if (body.isSuperAdmin === false) {
    const remaining = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isSuperAdmin, true))
      .get();
    const count = Number(remaining?.count ?? 0);
    const isSelf = id === guard.value.userId;
    if (isSelf && count <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last super-admin." },
        { status: 409 }
      );
    }
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { isSuperAdmin: true, inGameName: true, name: true, email: true },
  });

  await db
    .update(users)
    .set({ isSuperAdmin: body.isSuperAdmin })
    .where(eq(users.id, id));

  void logAudit({
    guildId: null,
    actorUserId: guard.value.userId,
    actorDisplay: await resolveActorDisplay(guard.value.userId),
    action: "user.super_admin.update",
    entityType: "user",
    entityId: id,
    entityLabel: target?.inGameName ?? target?.name ?? target?.email ?? id,
    changes: {
      before: { isSuperAdmin: target?.isSuperAdmin ?? false },
      after: { isSuperAdmin: body.isSuperAdmin },
    },
  });

  return NextResponse.json({ success: true });
}
