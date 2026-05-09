import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSignedInApi } from "@/lib/rbac";
import { db } from "@/db";
import { signups } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createSignup } from "@/lib/signups";

export async function POST(req: Request) {
  const session = await auth();
  const guard = requireSignedInApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json();

  const result = createSignup({
    membership,
    input: {
      eventId: body.eventId,
      userId: membership.userId,
      squad1Preference: body.squad1Preference ?? null,
      squad2Preference: body.squad2Preference ?? null,
      willingBackup: !!body.willingBackup,
      requestLeadership: !!body.requestLeadership,
      leadershipNote: body.leadershipNote ?? null,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
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
