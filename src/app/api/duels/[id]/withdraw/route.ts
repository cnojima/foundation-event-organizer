import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/duels/[id]/withdraw — proposer-only cancellation of a pending
// duel before the opponent responds. DMs the opposer (the proposer
// already knows what they did); silent if the opposer has DMs off or no
// linked Discord.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;

  const duel = await db.query.duelProposals.findFirst({
    where: eq(duelProposals.id, id),
  });
  if (!duel) {
    return NextResponse.json({ error: "Duel not found" }, { status: 404 });
  }
  if (!me.isSuperAdmin && duel.proposingUserId !== me.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (duel.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending duels can be withdrawn." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db
    .update(duelProposals)
    .set({
      status: "withdrawn",
      respondedByUserId: me.userId,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(duelProposals.id, id));

  void logAudit({
    guildId: me.guildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "duel.withdraw",
    entityType: "duel",
    entityId: duel.id,
    entityLabel: `vs ${await resolveActorDisplay(duel.opposingUserId)}`,
  });

  const notify = await sendDuelNotification({
    proposingUserId: duel.proposingUserId,
    opposingUserId: duel.opposingUserId,
    action: "withdrawn",
    proposedGameTime: duel.proposedGameTime,
    location: duel.location,
    winCondition: duel.winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
    // Only DM the opposer; proposer is the actor.
    targetUserId: duel.opposingUserId,
  });

  return NextResponse.json({ success: true, notify });
}
