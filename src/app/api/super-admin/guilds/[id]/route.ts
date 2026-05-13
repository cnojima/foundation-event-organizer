import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi, softDeleteGuildAndEvents } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, id),
    columns: { name: true },
  });

  db.transaction((tx) => {
    softDeleteGuildAndEvents(tx, id);
    tx.update(users)
      .set({ guildId: null, guildRole: null })
      .where(eq(users.guildId, id))
      .run();
  });

  void logAudit({
    guildId: id,
    actorUserId: guard.value.userId,
    actorDisplay: await resolveActorDisplay(guard.value.userId),
    action: "guild.super_admin.delete",
    entityType: "guild",
    entityId: id,
    entityLabel: guild?.name ?? id,
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  if (body.action !== "undelete") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, id),
    columns: { name: true },
  });

  await db.update(guilds).set({ deletedAt: null }).where(eq(guilds.id, id));

  void logAudit({
    guildId: id,
    actorUserId: guard.value.userId,
    actorDisplay: await resolveActorDisplay(guard.value.userId),
    action: "guild.super_admin.restore",
    entityType: "guild",
    entityId: id,
    entityLabel: guild?.name ?? id,
  });

  return NextResponse.json({ success: true });
}
