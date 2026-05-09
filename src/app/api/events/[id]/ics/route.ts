import { db } from "@/db";
import { events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildICS, icsResponse, slugify } from "@/lib/ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event || event.deletedAt) {
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
