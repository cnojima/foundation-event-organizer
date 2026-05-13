import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendScrimNotification } from "@/bot/discord-bot";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/scrimmages/[id]/decline — opposing-side admin declines.
// No events are created; proposal flips to "declined".
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;

  const proposal = await db.query.scrimProposals.findFirst({
    where: eq(scrimProposals.id, id),
  });
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (!me.isSuperAdmin && proposal.opposingGuildId !== me.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending proposals can be declined." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db
    .update(scrimProposals)
    .set({
      status: "declined",
      respondedByUserId: me.userId,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(scrimProposals.id, id));

  const proposingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, proposal.proposingGuildId),
    columns: { name: true },
  });
  void logAudit({
    guildId: me.guildId ?? proposal.opposingGuildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "scrim.decline",
    entityType: "scrim",
    entityId: proposal.id,
    entityLabel: `vs ${proposingGuild?.name ?? proposal.proposingGuildId}`,
  });

  const notify = await sendScrimNotification({
    proposingGuildId: proposal.proposingGuildId,
    opposingGuildId: proposal.opposingGuildId,
    action: "declined",
    proposedGameTime: proposal.proposedGameTime,
    location: proposal.location,
    winCondition: proposal.winCondition,
  });

  return NextResponse.json({ success: true, notify });
}
