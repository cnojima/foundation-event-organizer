import { db } from "@/db";
import { events, signups } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const WAITLIST_ROLE = "waitlist";

type EventCapacityFields = {
  maxPlayers: number;
  maxBackups: number;
  // Scrim events have a single squad, so capacity is half of a match.
  kind?: "match" | "simple" | "scrim";
};

export function getEventCapacity(event: EventCapacityFields): number {
  const squads = event.kind === "scrim" ? 1 : 2;
  return (event.maxPlayers + event.maxBackups) * squads;
}

export type EventCapacityStanding = {
  capacity: number;
  taken: number;
  waitlisted: number;
  isFull: boolean;
};

export async function getEventStanding(
  eventId: string
): Promise<EventCapacityStanding | null> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return null;
  const eventSignups = await db
    .select({ assignedRole: signups.assignedRole })
    .from(signups)
    .where(and(eq(signups.eventId, eventId), isNull(signups.deletedAt)));
  return computeStanding(event, eventSignups);
}

export function computeStanding(
  event: EventCapacityFields,
  eventSignups: { assignedRole: string | null }[]
): EventCapacityStanding {
  const capacity = getEventCapacity(event);
  const waitlisted = eventSignups.filter((s) => s.assignedRole === WAITLIST_ROLE).length;
  const taken = eventSignups.length - waitlisted;
  return { capacity, taken, waitlisted, isFull: taken >= capacity };
}
