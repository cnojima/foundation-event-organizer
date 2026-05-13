import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireGuildAdminApi } from "@/lib/rbac";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Toggle the flag on an audit log entry. Body: { flagged: boolean, note?: string }.
// Authorization: any admin of the entry's guild can flag/unflag. Super-admins
// can flag any entry regardless of which guild it belongs to.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  const entry = await db.query.auditLog.findFirst({
    where: eq(auditLog.id, id),
  });
  if (!entry) {
    return NextResponse.json({ error: "Audit entry not found" }, { status: 404 });
  }

  // Site-level entries (guildId null) can only be flagged by super-admins.
  // Guild-scoped entries require admin of that guild (super-admins pass too).
  const guard = entry.guildId
    ? requireGuildAdminApi(session, entry.guildId)
    : requireGuildAdminApi(session);
  if (!guard.ok) return guard.response;
  const me = guard.value;
  if (!entry.guildId && !me.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const flagged: boolean = body.flagged === true;
  const note: string | null =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;

  if (flagged) {
    await db
      .update(auditLog)
      .set({
        flaggedAt: new Date().toISOString(),
        flaggedByUserId: me.userId,
        flagNote: note,
      })
      .where(eq(auditLog.id, id));
  } else {
    await db
      .update(auditLog)
      .set({
        flaggedAt: null,
        flaggedByUserId: null,
        flagNote: null,
      })
      .where(eq(auditLog.id, id));
  }

  // Resolve the flagger's display name for the client to render without an
  // extra round-trip.
  let flaggerDisplay: string | null = null;
  if (flagged) {
    const u = await db.query.users.findFirst({
      where: eq(users.id, me.userId),
      columns: { inGameName: true, name: true, email: true },
    });
    flaggerDisplay = u?.inGameName ?? u?.name ?? u?.email ?? me.userId;
  }

  const updated = await db.query.auditLog.findFirst({
    where: eq(auditLog.id, id),
    columns: { flaggedAt: true, flagNote: true },
  });
  return NextResponse.json({
    flaggedAt: updated?.flaggedAt ?? null,
    flagNote: updated?.flagNote ?? null,
    flaggerDisplay,
  });
}
