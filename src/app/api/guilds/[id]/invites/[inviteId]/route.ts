import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guildInvites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: guildId, inviteId } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, guildId);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const invite = await db.query.guildInvites.findFirst({
    where: and(eq(guildInvites.id, inviteId), eq(guildInvites.guildId, guildId)),
  });

  const result = await db
    .update(guildInvites)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(guildInvites.id, inviteId), eq(guildInvites.guildId, guildId)))
    .returning({ id: guildInvites.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  void logAudit({
    guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "invite.revoke",
    entityType: "invite",
    entityId: inviteId,
    entityLabel: invite?.code ?? inviteId,
  });

  return NextResponse.json({ success: true });
}
