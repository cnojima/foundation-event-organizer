import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { outcomeToAbsoluteResult, scrimSideFor } from "@/lib/scrims";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/scrimmages/[id]/result — either guild's admin declares the
// outcome. Body: { outcome: "won"|"lost"|"draw"|"no_contest", notes? }.
// "won"/"lost" are viewer-relative — we convert to the absolute enum stored
// in the DB so each side's UI can compute its own W/L.
export async function POST(
  req: Request,
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
  const involved =
    me.isSuperAdmin ||
    proposal.proposingGuildId === me.guildId ||
    proposal.opposingGuildId === me.guildId;
  if (!involved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "accepted") {
    return NextResponse.json(
      { error: "Result can only be declared on accepted scrims." },
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

  const side = scrimSideFor(
    me.guildId,
    proposal.proposingGuildId,
    proposal.opposingGuildId
  );
  const absolute = outcomeToAbsoluteResult(
    side,
    outcome as "won" | "lost" | "draw" | "no_contest"
  );

  const now = new Date().toISOString();
  await db
    .update(scrimProposals)
    .set({
      result: absolute,
      resultNotes: notes,
      resultDeclaredByUserId: me.userId,
      resultDeclaredAt: now,
      updatedAt: now,
    })
    .where(eq(scrimProposals.id, id));

  const opponentGuildId =
    proposal.proposingGuildId === me.guildId
      ? proposal.opposingGuildId
      : proposal.proposingGuildId;
  const opponentGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, opponentGuildId),
    columns: { name: true },
  });
  void logAudit({
    guildId: me.guildId ?? proposal.proposingGuildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "scrim.result",
    entityType: "scrim",
    entityId: proposal.id,
    entityLabel: `vs ${opponentGuild?.name ?? opponentGuildId}`,
    changes: { after: { outcome, result: absolute } },
  });

  return NextResponse.json({ success: true, result: absolute });
}
