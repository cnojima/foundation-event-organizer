import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { sendScrimNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// POST /api/scrimmages — propose a scrim with another guild on the same server.
// Body: { opposingGuildId, proposedGameTime, location, winCondition, message? }
export async function POST(req: Request) {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;
  if (!me.guildId) {
    return NextResponse.json({ error: "Not in a guild" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const opposingGuildId = String(body.opposingGuildId ?? "");
  const proposedGameTime = String(body.proposedGameTime ?? "");
  const location = String(body.location ?? "").trim();
  const winCondition = String(body.winCondition ?? "").trim();
  const message = body.message ? String(body.message).trim() : null;

  if (!opposingGuildId || opposingGuildId === me.guildId) {
    return NextResponse.json(
      { error: "Pick a different guild as the opponent." },
      { status: 400 }
    );
  }
  const start = new Date(proposedGameTime);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { error: "Proposed game time is required and must be a valid date." },
      { status: 400 }
    );
  }
  if (!location) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }
  if (!winCondition) {
    return NextResponse.json(
      { error: "Condition of Win is required." },
      { status: 400 }
    );
  }

  // Same-server constraint.
  const myGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, me.guildId),
  });
  const opponent = await db.query.guilds.findFirst({
    where: and(eq(guilds.id, opposingGuildId), isNull(guilds.deletedAt)),
  });
  if (!opponent) {
    return NextResponse.json(
      { error: "Opposing guild not found." },
      { status: 404 }
    );
  }
  if (
    !myGuild?.serverNumber ||
    !opponent.serverNumber ||
    myGuild.serverNumber !== opponent.serverNumber
  ) {
    return NextResponse.json(
      {
        error:
          "Both guilds must be on the same server. Set Server # in Guild Settings if it's missing.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(scrimProposals).values({
    id,
    proposingGuildId: me.guildId,
    opposingGuildId,
    proposedByUserId: me.userId,
    proposedGameTime: start.toISOString(),
    location,
    winCondition,
    message,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  void logAudit({
    guildId: me.guildId,
    actorUserId: me.userId,
    actorDisplay: await resolveActorDisplay(me.userId),
    action: "scrim.propose",
    entityType: "scrim",
    entityId: id,
    entityLabel: `vs ${opponent.name}`,
    changes: { after: { proposedGameTime: start.toISOString(), location } },
  });

  const notify = await sendScrimNotification({
    proposingGuildId: me.guildId,
    opposingGuildId,
    action: "proposed",
    proposedGameTime: start.toISOString(),
    location,
    winCondition,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  return NextResponse.json({ id, notify }, { status: 201 });
}

// GET /api/scrimmages — list scrims involving the caller's guild, bucketed
// by status. Useful for the dashboard.
export async function GET() {
  const session = await auth();
  const guard = requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;
  if (!me.guildId) {
    return NextResponse.json({ error: "Not in a guild" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(scrimProposals)
    .where(
      or(
        eq(scrimProposals.proposingGuildId, me.guildId),
        eq(scrimProposals.opposingGuildId, me.guildId)
      )
    )
    .orderBy(desc(scrimProposals.createdAt));

  return NextResponse.json({ rows });
}
