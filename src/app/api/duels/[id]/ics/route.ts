import { auth } from "@/auth";
import { db } from "@/db";
import { duelProposals, guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSignedInApi } from "@/lib/rbac";
import { buildICS, icsResponse, slugify, type IcsEvent } from "@/lib/ics";
import { displayName } from "@/lib/display";

// GET /api/duels/[id]/ics — single .ics download for an accepted duel.
// Authorization mirrors the duel detail page: only the two players or a
// super-admin can pull the calendar entry. Pending / declined / withdrawn
// / cancelled duels are 404 since there's no scheduled time to attend.
export async function GET(
  _req: Request,
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
  if (!duel) return new Response("Duel not found", { status: 404 });

  const involved =
    me.isSuperAdmin ||
    duel.proposingUserId === me.userId ||
    duel.opposingUserId === me.userId;
  if (!involved) {
    return new Response("Forbidden", { status: 403 });
  }
  if (duel.status !== "accepted") {
    return new Response("Duel is not scheduled", { status: 400 });
  }

  // Pull both players' display names so the calendar entry reads "X vs Y"
  // rather than just "Duel".
  const [proposing, opposing] = await Promise.all([
    db
      .select({ inGameName: users.inGameName, guildTag: guilds.tag })
      .from(users)
      .leftJoin(guilds, eq(users.guildId, guilds.id))
      .where(eq(users.id, duel.proposingUserId))
      .get(),
    db
      .select({ inGameName: users.inGameName, guildTag: guilds.tag })
      .from(users)
      .leftJoin(guilds, eq(users.guildId, guilds.id))
      .where(eq(users.id, duel.opposingUserId))
      .get(),
  ]);
  const proposerName = displayName(
    { inGameName: proposing?.inGameName ?? null },
    proposing?.guildTag ?? null
  );
  const opposerName = displayName(
    { inGameName: opposing?.inGameName ?? null },
    opposing?.guildTag ?? null
  );
  const title = `Duel: ${proposerName} vs ${opposerName}`;

  const ics: IcsEvent[] = [
    {
      uid: `duel-${duel.id}@shadowfront.local`,
      start: new Date(duel.proposedGameTime),
      title,
      description: `Condition of Win: ${duel.winCondition}${
        duel.message ? `\n\n${duel.message}` : ""
      }`,
      location: duel.location,
    },
  ];

  return icsResponse(`${slugify(title)}.ics`, buildICS(ics));
}
