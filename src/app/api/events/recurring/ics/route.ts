import { buildICS, icsResponse } from "@/lib/ics";

// Anchor on a known Saturday at 18:00 UTC. 2024-01-06 is a Saturday.
const ANCHOR = new Date("2024-01-06T18:00:00Z");

export async function GET() {
  const ics = buildICS({
    uid: "weekly-saturday-1800-utc@shadowfront.local",
    start: ANCHOR,
    title: "Shadowfront Weekly Match",
    description: "Recurring weekly match — every Saturday at 18:00 UTC.",
    rrule: "FREQ=WEEKLY;BYDAY=SA",
  });

  return icsResponse("shadowfront-weekly.ics", ics);
}
