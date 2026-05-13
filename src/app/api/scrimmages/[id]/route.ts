import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// PATCH /api/scrimmages/[id] — proposer-only edits while pending.
// Body: { proposedGameTime?, location?, winCondition?, message? }
export async function PATCH(
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
  if (!me.isSuperAdmin && proposal.proposingGuildId !== me.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending proposals can be edited." },
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
    if (!v) return NextResponse.json({ error: "Location required." }, { status: 400 });
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
    const v = body.message ? String(body.message).trim() : null;
    updates.message = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  updates.updatedAt = new Date().toISOString();

  await db.update(scrimProposals).set(updates).where(eq(scrimProposals.id, id));

  const before: Record<string, unknown> = {};
  for (const k of Object.keys(updates)) {
    if (k === "updatedAt") continue;
    if (k === "message") continue;
    before[k] = (proposal as Record<string, unknown>)[k];
  }
  const opponentGuildId =
    proposal.proposingGuildId === me.guildId
      ? proposal.opposingGuildId
      : proposal.proposingGuildId;
  const opponentGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, opponentGuildId),
    columns: { name: true },
  });
  const afterForLog: Record<string, unknown> = { ...updates };
  delete afterForLog.updatedAt;
  delete afterForLog.message;
  void logAudit({
    guildId: proposal.proposingGuildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "scrim.update",
    entityType: "scrim",
    entityId: proposal.id,
    entityLabel: `vs ${opponentGuild?.name ?? opponentGuildId}`,
    changes: { before, after: afterForLog },
  });

  return NextResponse.json({ success: true });
}
