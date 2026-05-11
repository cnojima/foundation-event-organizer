import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { events, guilds, scrimProposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { sendScrimNotification } from "@/bot/discord-bot";

// POST /api/scrimmages/[id]/accept — opposing-side admin accepts. Creates
// two mirrored `events` rows (one per guild, both kind=scrim, linked via
// scrimmageId), and flips the proposal to "accepted".
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
  if (!me.isSuperAdmin && proposal.opposingGuildId !== me.guildId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (proposal.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending proposals can be accepted." },
      { status: 409 }
    );
  }

  const proposingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, proposal.proposingGuildId),
  });
  const opposingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, proposal.opposingGuildId),
  });
  if (!proposingGuild || !opposingGuild) {
    return NextResponse.json({ error: "Guild missing" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const proposingEventId = generateId();
  const opposingEventId = generateId();

  // Each side's event names itself "vs <other guild>". Single squad per
  // guild — we set squad1 fields and leave squad2 unused.
  const baseEventFields = {
    description: `Win Condition: ${proposal.winCondition}\nLocation: ${proposal.location}${
      proposal.message ? `\n\n${proposal.message}` : ""
    }`,
    gameTime: proposal.proposedGameTime,
    squad1StartsAt: proposal.proposedGameTime,
    squad2StartsAt: null,
    signupOpens: null,
    signupCloses: null,
    kind: "scrim" as const,
    squad2Name: "—",
    maxPlayers: 20,
    maxBackups: 10,
    leadershipSlots: 3,
    metadata: null,
    createdAt: now,
    scrimmageId: proposal.id,
  };

  db.transaction((tx) => {
    tx.insert(events)
      .values({
        ...baseEventFields,
        id: proposingEventId,
        guildId: proposal.proposingGuildId,
        opposingGuildId: proposal.opposingGuildId,
        name: `Scrim vs ${opposingGuild.name}`,
        squad1Name: proposingGuild.name,
      })
      .run();
    tx.insert(events)
      .values({
        ...baseEventFields,
        id: opposingEventId,
        guildId: proposal.opposingGuildId,
        opposingGuildId: proposal.proposingGuildId,
        name: `Scrim vs ${proposingGuild.name}`,
        squad1Name: opposingGuild.name,
      })
      .run();
    tx.update(scrimProposals)
      .set({
        status: "accepted",
        respondedByUserId: me.userId,
        respondedAt: now,
        proposingEventId,
        opposingEventId,
        updatedAt: now,
      })
      .where(eq(scrimProposals.id, id))
      .run();
  });

  const notify = await sendScrimNotification({
    proposingGuildId: proposal.proposingGuildId,
    opposingGuildId: proposal.opposingGuildId,
    action: "accepted",
    proposedGameTime: proposal.proposedGameTime,
    location: proposal.location,
    winCondition: proposal.winCondition,
  });

  return NextResponse.json({
    success: true,
    proposingEventId,
    opposingEventId,
    notify,
  });
}
