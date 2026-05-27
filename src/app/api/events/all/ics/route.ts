import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { buildICS, icsResponse, slugify, type IcsEvent } from "@/lib/ics";

// GET /api/events/all/ics
//
// Bulk calendar export for the signed-in user's guild. One VEVENT per
// scheduled simple event and one per scheduled match-event squad. Allows
// admins/players to subscribe to the whole guild's calendar in one go from
// the events list, instead of clicking "Add to Calendar" on each event.
export async function GET() {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  if (!membership.guildId) {
    return new Response("Not a member of any guild.", { status: 403 });
  }

  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.guildId, membership.guildId), isNull(events.deletedAt))
    );

  const ics: IcsEvent[] = [];
  for (const event of rows) {
    const durationMs = event.durationMinutes ? event.durationMinutes * 60_000 : null;
    if (event.kind === "match") {
      if (event.squad1StartsAt) {
        const start = new Date(event.squad1StartsAt);
        ics.push({
          uid: `${event.id}-squad1@shadowfront.local`,
          start,
          end: durationMs ? new Date(start.getTime() + durationMs) : undefined,
          title: `${event.name} — ${event.squad1Name}`,
          description: event.description ?? undefined,
        });
      }
      if (event.squad2StartsAt) {
        const start = new Date(event.squad2StartsAt);
        ics.push({
          uid: `${event.id}-squad2@shadowfront.local`,
          start,
          end: durationMs ? new Date(start.getTime() + durationMs) : undefined,
          title: `${event.name} — ${event.squad2Name}`,
          description: event.description ?? undefined,
        });
      }
    } else if (event.gameTime) {
      const start = new Date(event.gameTime);
      ics.push({
        uid: `${event.id}@shadowfront.local`,
        start,
        end: durationMs ? new Date(start.getTime() + durationMs) : undefined,
        title: event.name,
        description: event.description ?? undefined,
      });
    }
  }

  if (ics.length === 0) {
    return new Response("No scheduled events to export.", { status: 404 });
  }

  return icsResponse(`${slugify(membership.guildSlug ?? "guild")}-events.ics`, buildICS(ics));
}
