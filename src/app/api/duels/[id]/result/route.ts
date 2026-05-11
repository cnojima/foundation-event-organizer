import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  computeRatingChanges,
  duelSideFor,
  outcomeToAbsoluteResult,
} from "@/lib/duels";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";

// POST /api/duels/[id]/result — either player declares the outcome of an
// accepted duel. Single-declaration model: whoever submits first locks in
// the result. Updates ELO + W-L-D counters atomically.
//
// Body: { outcome: "won" | "lost" | "draw" | "no_contest", notes? }
//
// "won" and "lost" are viewer-relative (relative to the caller); the server
// flips them to the absolute proposing_won / opposing_won enum based on
// which side the caller is on. "draw" and "no_contest" are perspective-free.
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
      { error: "Result can only be declared on accepted duels." },
      { status: 409 }
    );
  }
  if (duel.result) {
    return NextResponse.json(
      { error: "Result already declared." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const outcome = String(body.outcome ?? "");
  const notes = body.notes ? String(body.notes).trim() : null;
  if (!["won", "lost", "draw", "no_contest"].includes(outcome)) {
    return NextResponse.json(
      { error: "Outcome must be won, lost, draw, or no_contest." },
      { status: 400 }
    );
  }

  const side = duelSideFor(
    me.userId,
    duel.proposingUserId,
    duel.opposingUserId
  );
  const absolute = outcomeToAbsoluteResult(
    side,
    outcome as "won" | "lost" | "draw" | "no_contest"
  );

  // Look up both players' current ratings for ELO computation.
  const [proposing, opposing] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, duel.proposingUserId) }),
    db.query.users.findFirst({ where: eq(users.id, duel.opposingUserId) }),
  ]);
  if (!proposing || !opposing) {
    return NextResponse.json(
      { error: "Could not load player profiles." },
      { status: 500 }
    );
  }
  const deltas = computeRatingChanges(
    absolute,
    proposing.duelRating,
    opposing.duelRating
  );

  const now = new Date().toISOString();

  // One transaction: write the result row + update both players' ratings
  // and W-L-D counters. If anything throws, ratings stay consistent.
  db.transaction((tx) => {
    tx.update(duelProposals)
      .set({
        result: absolute,
        resultNotes: notes,
        resultDeclaredByUserId: me.userId,
        resultDeclaredAt: now,
        updatedAt: now,
      })
      .where(eq(duelProposals.id, id))
      .run();

    // Rating + W-L-D bumps. SQL increments via `+ N` are atomic and avoid
    // a read-modify-write race if two concurrent result declarations
    // touched the same player (which our 409 guard should already
    // prevent, but defense in depth).
    const proposingWon = absolute === "proposing_won";
    const opposingWon = absolute === "opposing_won";
    const isDraw = absolute === "draw";
    const isNoContest = absolute === "no_contest";

    tx.update(users)
      .set({
        duelRating: sql`${users.duelRating} + ${deltas.proposing}`,
        duelWins: proposingWon
          ? sql`${users.duelWins} + 1`
          : users.duelWins,
        duelLosses: opposingWon
          ? sql`${users.duelLosses} + 1`
          : users.duelLosses,
        duelDraws: isDraw ? sql`${users.duelDraws} + 1` : users.duelDraws,
        // no_contest still advances lastDuelAt so the leaderboard's
        // active-filter reflects engagement, but doesn't touch W-L-D.
        lastDuelAt: now,
      })
      .where(eq(users.id, duel.proposingUserId))
      .run();

    tx.update(users)
      .set({
        duelRating: sql`${users.duelRating} + ${deltas.opposing}`,
        duelWins: opposingWon
          ? sql`${users.duelWins} + 1`
          : users.duelWins,
        duelLosses: proposingWon
          ? sql`${users.duelLosses} + 1`
          : users.duelLosses,
        duelDraws: isDraw ? sql`${users.duelDraws} + 1` : users.duelDraws,
        lastDuelAt: now,
      })
      .where(eq(users.id, duel.opposingUserId))
      .run();

    // Silence the unused flag warning — kept for readability above.
    void isNoContest;
  });

  const notify = await sendDuelNotification({
    proposingUserId: duel.proposingUserId,
    opposingUserId: duel.opposingUserId,
    action: "result_declared",
    proposedGameTime: duel.proposedGameTime,
    location: duel.location,
    winCondition: duel.winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  return NextResponse.json({
    success: true,
    result: absolute,
    ratingDeltas: deltas,
    notify,
  });
}
