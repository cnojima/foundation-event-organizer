import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guildInvites } from "@/db/schema";
import { randomBytes } from "crypto";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: guildId } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session, guildId);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json().catch(() => ({}));
  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt).toISOString()
    : null;
  const maxUses =
    typeof body.maxUses === "number" && body.maxUses > 0 ? body.maxUses : null;

  const code = randomBytes(8).toString("base64url");
  const inviteId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.insert(guildInvites).values({
    id: inviteId,
    guildId,
    code,
    createdByUserId: membership.userId,
    expiresAt,
    maxUses,
    createdAt,
  });

  void logAudit({
    guildId,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "invite.create",
    entityType: "invite",
    entityId: inviteId,
    entityLabel: code,
    changes: { after: { maxUses, expiresAt } },
  });

  return NextResponse.json({ id: inviteId, code }, { status: 201 });
}
