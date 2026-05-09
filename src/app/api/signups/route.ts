import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, signups } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { computeStanding, WAITLIST_ROLE } from "@/lib/waitlist";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { eventId, squad1Preference, squad2Preference, willingBackup, requestLeadership, leadershipNote } = body;
  const userId = session.user.id;

  const result = db.transaction((tx) => {
    const existing = tx
      .select({ id: signups.id })
      .from(signups)
      .where(and(eq(signups.eventId, eventId), eq(signups.userId, userId)))
      .get();
    if (existing) return { error: "Already signed up", status: 409 as const };

    const event = tx.select().from(events).where(eq(events.id, eventId)).get();
    if (!event || event.deletedAt) {
      return { error: "Event not found", status: 404 as const };
    }
    if (event.kind !== "match") {
      return { error: "This event does not accept signups", status: 400 as const };
    }

    const currentSignups = tx
      .select({ assignedRole: signups.assignedRole })
      .from(signups)
      .where(eq(signups.eventId, eventId))
      .all();
    const standing = computeStanding(event, currentSignups);
    const assignedRole = standing.isFull ? WAITLIST_ROLE : null;

    tx.insert(signups)
      .values({
        id: generateId(),
        eventId,
        userId,
        squad1Preference,
        squad2Preference,
        willingBackup,
        requestLeadership,
        leadershipNote,
        assignedRole,
        createdAt: new Date().toISOString(),
      })
      .run();

    return { waitlisted: assignedRole === WAITLIST_ROLE };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { success: true, waitlisted: result.waitlisted },
    { status: 201 }
  );
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, squad1Preference, squad2Preference, willingBackup, requestLeadership, leadershipNote } = body;

  // Verify ownership
  const existing = await db.query.signups.findFirst({
    where: and(eq(signups.id, id), eq(signups.userId, session.user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(signups)
    .set({ squad1Preference, squad2Preference, willingBackup, requestLeadership, leadershipNote })
    .where(eq(signups.id, id));

  return NextResponse.json({ success: true });
}
