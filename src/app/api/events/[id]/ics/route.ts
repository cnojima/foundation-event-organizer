import { auth } from "@/auth";
import { canViewEvent } from "@/lib/rbac";
import { buildICS, icsResponse, slugify } from "@/lib/ics";

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
  if (!event.gameTime) {
    return new Response("Event has no game time set", { status: 400 });
  }

  const ics = buildICS({
    uid: `${event.id}@shadowfront.local`,
    start: new Date(event.gameTime),
    title: event.name,
    description: event.description ?? undefined,
  });

  return icsResponse(`${slugify(event.name)}.ics`, ics);
}
