import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { events, signups } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateId } from "@/lib/ids";
import { computeStanding, WAITLIST_ROLE } from "@/lib/waitlist";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();
  const { eventId, squad1Preference, squad2Preference, willingBackup, requestLeadership, leadershipNote } = body;
  const userId = membership.userId;

  const result = db.transaction((tx) => {
    const event = tx.select().from(events).where(eq(events.id, eventId)).get();
    if (!event || event.deletedAt) {
      return { error: "Event not found", status: 404 as const };
    }
    if (event.kind !== "match") {
      return { error: "This event does not accept signups", status: 400 as const };
    }
    // Members-only: must belong to the event's guild (super-admin override).
    if (!membership.isSuperAdmin && membership.guildId !== event.guildId) {
      return { error: "Forbidden", status: 403 as const };
    }

    const existing = tx
      .select({ id: signups.id })
      .from(signups)
      .where(
        and(
          eq(signups.eventId, eventId),
          eq(signups.userId, userId),
          isNull(signups.deletedAt)
        )
      )
      .get();
    if (existing) return { error: "Already signed up", status: 409 as const };

    const currentSignups = tx
      .select({ assignedRole: signups.assignedRole })
      .from(signups)
      .where(and(eq(signups.eventId, eventId), isNull(signups.deletedAt)))
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
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();
  const { id, squad1Preference, squad2Preference, willingBackup, requestLeadership, leadershipNote } = body;

  const existing = await db.query.signups.findFirst({
    where: and(
      eq(signups.id, id),
      eq(signups.userId, membership.userId),
      isNull(signups.deletedAt)
    ),
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
