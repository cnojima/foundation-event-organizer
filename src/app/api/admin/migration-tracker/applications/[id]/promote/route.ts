import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { reviewApplication } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Deliberate officer action — pulls a specific waitlisted applicant into
// "applied" out of order. Distinct from the automatic, oldest-first
// promoteFromWaitlist backfill (see reviewApplication), so it's logged
// under its own audit action.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canReviewMigrationApplication(session, id);
  if (!guard.ok) return guard.response;
  const { membership } = guard.value;

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const result = reviewApplication(id, "promote", membership.userId, note);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.promote",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });

  return NextResponse.json({ application: result.application });
}
