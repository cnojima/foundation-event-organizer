import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/scrimmages/[id]/withdraw — proposer-side admin withdraws a
// still-pending proposal. Mirrors decline but is owner-initiated.
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
  if (!me.isSuperAdmin && proposal.proposingGuildId !== me.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending proposals can be withdrawn." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db
    .update(scrimProposals)
    .set({
      status: "withdrawn",
      respondedByUserId: me.userId,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(scrimProposals.id, id));

  const opposingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, proposal.opposingGuildId),
    columns: { name: true },
  });
  void logAudit({
    guildId: proposal.proposingGuildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "scrim.withdraw",
    entityType: "scrim",
    entityId: proposal.id,
    entityLabel: `vs ${opposingGuild?.name ?? proposal.opposingGuildId}`,
  });

  return NextResponse.json({ success: true });
}
