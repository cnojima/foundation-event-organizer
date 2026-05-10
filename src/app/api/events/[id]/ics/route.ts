import { auth } from "@/auth";
import { canViewEvent } from "@/lib/rbac";
import { buildICS, icsResponse, slugify, type IcsEvent } from "@/lib/ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canViewEvent(session, id);
  if (!guard.ok) return guard.response;
  const { event } = guard.value;

  if (event.deletedAt) {
    return new Response("Event not found", { status: 404 });
  }

  // Match events: one VEVENT per squad with a start time. Simple events: one
  // VEVENT for gameTime. UIDs are squad-suffixed so calendars treat them as
  // independent entries (and updates per squad don't clobber each other).
  const ics: IcsEvent[] = [];
  if (event.kind === "match") {
    if (event.squad1StartsAt) {
      ics.push({
        uid: `${event.id}-squad1@shadowfront.local`,
        start: new Date(event.squad1StartsAt),
        title: `${event.name} — ${event.squad1Name}`,
        description: event.description ?? undefined,
      });
    }
    if (event.squad2StartsAt) {
      ics.push({
        uid: `${event.id}-squad2@shadowfront.local`,
        start: new Date(event.squad2StartsAt),
        title: `${event.name} — ${event.squad2Name}`,
        description: event.description ?? undefined,
      });
    }
  } else if (event.gameTime) {
    ics.push({
      uid: `${event.id}@shadowfront.local`,
      start: new Date(event.gameTime),
      title: event.name,
      description: event.description ?? undefined,
    });
  }

  if (ics.length === 0) {
    return new Response("Event has no start time set", { status: 400 });
  }

  return icsResponse(`${slugify(event.name)}.ics`, buildICS(ics));
}
