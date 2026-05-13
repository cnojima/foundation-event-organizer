import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { clearDuelNotifications } from "@/lib/duel-notifications";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// PATCH /api/duels/[id] — proposer-only edits while still pending. Body:
// { proposedGameTime?, location?, winCondition?, message? }
export async function PATCH(
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
  // Either player can edit while pending — bidirectional counter-proposal
  // negotiation. The accept endpoint enforces "can't accept your own
  // latest terms" so opposer edits don't auto-lock without proposer
  // re-approval (and vice versa).
  if (
    !me.isSuperAdmin &&
    duel.proposingUserId !== me.userId &&
    duel.opposingUserId !== me.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (duel.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending duels can be edited." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if ("proposedGameTime" in body) {
    const d = new Date(String(body.proposedGameTime));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    updates.proposedGameTime = d.toISOString();
  }
  if ("location" in body) {
    const v = String(body.location ?? "").trim();
    if (!v)
      return NextResponse.json({ error: "Location required." }, { status: 400 });
    updates.location = v;
  }
  if ("winCondition" in body) {
    const v = String(body.winCondition ?? "").trim();
    if (!v)
      return NextResponse.json(
        { error: "Condition of Win required." },
        { status: 400 }
      );
    updates.winCondition = v;
  }
  if ("message" in body) {
    updates.message = body.message ? String(body.message).trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  updates.updatedAt = new Date().toISOString();
  // Stamp the editor so the accept endpoint can enforce "the OTHER side
  // must approve these terms." Super-admin edits still set this — they're
  // counted as if the side they're acting on made the change.
  updates.lastEditedByUserId = me.userId;

  await db.update(duelProposals).set(updates).where(eq(duelProposals.id, id));

  // If the start time changed, wipe sent-reminder records so the poller
  // re-evaluates against the new time. (Pure location/win-condition
  // edits don't touch reminder cycles.)
  const timeChanged =
    "proposedGameTime" in updates &&
    updates.proposedGameTime !== duel.proposedGameTime;
  if (timeChanged) {
    clearDuelNotifications(id);
  }

  const before: Record<string, unknown> = {};
  for (const k of Object.keys(updates)) {
    if (k === "updatedAt" || k === "lastEditedByUserId" || k === "message") continue;
    before[k] = (duel as Record<string, unknown>)[k];
  }
  const afterForLog: Record<string, unknown> = { ...updates };
  delete afterForLog.updatedAt;
  delete afterForLog.lastEditedByUserId;
  delete afterForLog.message;
  const opponentUserIdForLabel =
    me.userId === duel.proposingUserId
      ? duel.opposingUserId
      : duel.proposingUserId;
  void logAudit({
    guildId: me.guildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "duel.update",
    entityType: "duel",
    entityId: duel.id,
    entityLabel: `vs ${await resolveActorDisplay(opponentUserIdForLabel)}`,
    changes: { before, after: afterForLog },
  });

  // DM the OTHER side (not the editor) with the new details. Post-update
  // values so the message reflects the new time / location / win
  // condition.
  const otherSideUserId =
    me.userId === duel.proposingUserId
      ? duel.opposingUserId
      : duel.proposingUserId;
  const notify = await sendDuelNotification({
    proposingUserId: duel.proposingUserId,
    opposingUserId: duel.opposingUserId,
    action: "edited",
    proposedGameTime:
      (updates.proposedGameTime as string | undefined) ?? duel.proposedGameTime,
    location: (updates.location as string | undefined) ?? duel.location,
    winCondition:
      (updates.winCondition as string | undefined) ?? duel.winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
    targetUserId: otherSideUserId,
  });

  return NextResponse.json({ success: true, notify });
}
