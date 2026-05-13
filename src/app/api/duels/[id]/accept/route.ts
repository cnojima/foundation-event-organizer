import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/duels/[id]/accept — opposing player accepts. Flips status to
// "accepted" and records the response time. No mirrored events created —
// duels don't have rosters.
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
  // Both sides can edit a pending proposal, so both sides can also
  // accept — but only the side that DIDN'T just edit. If `lastEditedBy`
  // is null (fresh proposal, no edits), the proposer effectively set the
  // terms, so the opposer is the accepter.
  if (
    !me.isSuperAdmin &&
    duel.proposingUserId !== me.userId &&
    duel.opposingUserId !== me.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (duel.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending duels can be accepted." },
      { status: 409 }
    );
  }
  const effectiveLastEditor =
    duel.lastEditedByUserId ?? duel.proposingUserId;
  if (!me.isSuperAdmin && me.userId === effectiveLastEditor) {
    return NextResponse.json(
      {
        error:
          "You can't accept your own latest terms — wait for the other player to accept.",
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db
    .update(duelProposals)
    .set({
      status: "accepted",
      respondedByUserId: me.userId,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(duelProposals.id, id));

  const opponentUserId =
    me.userId === duel.proposingUserId
      ? duel.opposingUserId
      : duel.proposingUserId;
  void logAudit({
    guildId: me.guildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "duel.accept",
    entityType: "duel",
    entityId: duel.id,
    entityLabel: `vs ${await resolveActorDisplay(opponentUserId)}`,
  });

  const notify = await sendDuelNotification({
    proposingUserId: duel.proposingUserId,
    opposingUserId: duel.opposingUserId,
    action: "accepted",
    proposedGameTime: duel.proposedGameTime,
    location: duel.location,
    winCondition: duel.winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  return NextResponse.json({ success: true, notify });
}
