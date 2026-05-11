import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { duelProposals, guilds, users } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { sendDuelNotification } from "@/bot/discord-bot";
import { appBaseUrlFromRequest } from "@/lib/url";

// POST /api/duels — propose a duel against another player on the same
// server. Body: { opposingUserId, proposedGameTime, location, winCondition,
// message? }.
export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;

  if (!me.guildId) {
    return NextResponse.json(
      { error: "You must be in a guild to propose duels." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const opposingUserId = String(body.opposingUserId ?? "");
  const proposedGameTime = String(body.proposedGameTime ?? "");
  const location = String(body.location ?? "").trim();
  const winCondition = String(body.winCondition ?? "").trim();
  const message = body.message ? String(body.message).trim() : null;

  if (!opposingUserId || opposingUserId === me.userId) {
    return NextResponse.json(
      { error: "Pick a different player as the opponent." },
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
  if (start.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Proposed game time must be in the future." },
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

  // Verify the opposing player is real, discoverable, and on the same
  // server. Discoverable check means an opted-out player can't be
  // challenged even with a direct URL — privacy is enforced server-side.
  const opponent = await db.query.users.findFirst({
    where: eq(users.id, opposingUserId),
  });
  if (!opponent) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (!opponent.discoverableForDuels) {
    return NextResponse.json(
      { error: "This player isn't accepting duel challenges." },
      { status: 403 }
    );
  }
  if (!opponent.guildId) {
    return NextResponse.json(
      { error: "This player isn't in a guild." },
      { status: 400 }
    );
  }
  const [myGuild, theirGuild] = await Promise.all([
    db.query.guilds.findFirst({ where: eq(guilds.id, me.guildId) }),
    db.query.guilds.findFirst({ where: eq(guilds.id, opponent.guildId) }),
  ]);
  if (
    !myGuild?.serverNumber ||
    !theirGuild?.serverNumber ||
    myGuild.serverNumber !== theirGuild.serverNumber
  ) {
    return NextResponse.json(
      { error: "Both players must be on the same server." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(duelProposals).values({
    id,
    proposingUserId: me.userId,
    opposingUserId,
    proposedGameTime: start.toISOString(),
    location,
    winCondition,
    message,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const notify = await sendDuelNotification({
    proposingUserId: me.userId,
    opposingUserId,
    action: "proposed",
    proposedGameTime: start.toISOString(),
    location,
    winCondition,
    duelId: id,
    appBaseUrl: appBaseUrlFromRequest(req),
  });

  return NextResponse.json({ id, notify }, { status: 201 });
}

// GET /api/duels — list duels involving the caller. Both incoming and
// outgoing; client-side bucketing by status.
export async function GET() {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;

  const rows = await db
    .select()
    .from(duelProposals)
    .where(
      or(
        eq(duelProposals.proposingUserId, me.userId),
        eq(duelProposals.opposingUserId, me.userId)
      )
    )
    .orderBy(desc(duelProposals.createdAt));

  return NextResponse.json({ rows });
}
