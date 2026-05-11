import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";

// POST /api/duels/[id]/cancel — either player cancels an accepted duel
// before a result is declared. Flips status to "cancelled". Discord-posts
// to both sides since this affects scheduling for both players.
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
  const involved =
    me.isSuperAdmin ||
    duel.proposingUserId === me.userId ||
    duel.opposingUserId === me.userId;
  if (!involved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (duel.status !== "accepted") {
    return NextResponse.json(
      { error: "Only accepted duels can be cancelled." },
      { status: 409 }
    );
  }
  if (duel.result) {
    return NextResponse.json(
      { error: "Result already declared; cannot cancel." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db
    .update(duelProposals)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(duelProposals.id, id));

  const notify = await sendDuelNotification({
    proposingUserId: duel.proposingUserId,
    opposingUserId: duel.opposingUserId,
    action: "cancelled",
    proposedGameTime: duel.proposedGameTime,
    location: duel.location,
    winCondition: duel.winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  return NextResponse.json({ success: true, notify });
}
