import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { events, scrimProposals } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

// POST /api/scrimmages/[id]/cancel — either guild's admin cancels an
// accepted scrim before the result is declared. Soft-deletes both mirrored
// events so they drop off member listings; proposal flips to "cancelled".
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
  const involved =
    me.isSuperAdmin ||
    proposal.proposingGuildId === me.guildId ||
    proposal.opposingGuildId === me.guildId;
  if (!involved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "accepted") {
    return NextResponse.json(
      { error: "Only accepted scrims can be cancelled." },
      { status: 409 }
    );
  }
  if (proposal.result) {
    return NextResponse.json(
      { error: "Result already declared; cannot cancel." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const eventIds = [proposal.proposingEventId, proposal.opposingEventId].filter(
    (x): x is string => !!x
  );

  db.transaction((tx) => {
    if (eventIds.length > 0) {
      tx.update(events)
        .set({ deletedAt: now })
        .where(and(inArray(events.id, eventIds), isNull(events.deletedAt)))
        .run();
    }
    tx.update(scrimProposals)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(scrimProposals.id, id))
      .run();
  });

  return NextResponse.json({ success: true });
}
