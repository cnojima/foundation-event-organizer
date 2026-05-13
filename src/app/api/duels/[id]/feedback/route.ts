import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/duels/[id]/feedback — each duelist leaves a thumbs-up or
// thumbs-down for the opponent after the result is declared. One rating
// per side per duel; locked after submission to prevent retaliation
// edit-cycles.
//
// Body: { rating: "up" | "down" }
//
// Updates the per-duel feedback column AND increments the opponent's
// aggregate counter on users in one transaction.
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
  if (
    duel.proposingUserId !== me.userId &&
    duel.opposingUserId !== me.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!duel.result) {
    return NextResponse.json(
      { error: "Feedback opens once the result is declared." },
      { status: 409 }
    );
  }

  const isProposingSide = duel.proposingUserId === me.userId;
  const existingFeedback = isProposingSide
    ? duel.proposingFeedback
    : duel.opposingFeedback;
  if (existingFeedback) {
    return NextResponse.json(
      { error: "You've already left feedback for this duel." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const rating = String(body.rating ?? "");
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json(
      { error: "Rating must be 'up' or 'down'." },
      { status: 400 }
    );
  }

  const opponentUserId = isProposingSide
    ? duel.opposingUserId
    : duel.proposingUserId;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    // Stamp the feedback on the duel row (per-side column).
    if (isProposingSide) {
      tx.update(duelProposals)
        .set({
          proposingFeedback: rating,
          proposingFeedbackAt: now,
          updatedAt: now,
        })
        .where(eq(duelProposals.id, id))
        .run();
    } else {
      tx.update(duelProposals)
        .set({
          opposingFeedback: rating,
          opposingFeedbackAt: now,
          updatedAt: now,
        })
        .where(eq(duelProposals.id, id))
        .run();
    }

    // Bump the OPPONENT'S aggregate counter — feedback measures how the
    // opponent behaved, so that's where the count goes.
    tx.update(users)
      .set(
        rating === "up"
          ? { feedbackUpCount: sql`${users.feedbackUpCount} + 1` }
          : { feedbackDownCount: sql`${users.feedbackDownCount} + 1` }
      )
      .where(eq(users.id, opponentUserId))
      .run();
  });

  void logAudit({
    guildId: me.guildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "duel.feedback",
    entityType: "duel",
    entityId: duel.id,
    entityLabel: `vs ${await resolveActorDisplay(opponentUserId)}`,
    changes: { after: { rating } },
  });

  return NextResponse.json({ success: true, rating });
}
