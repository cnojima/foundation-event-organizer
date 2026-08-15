import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { reviewApplication } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Undo path for an accidental Accept click — moves an accepted application
// back to "applied". Same reviewer permission as accept/deny/waitlist, not
// server-admin-only like remove.
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

  const result = reviewApplication(id, "revert", membership.userId, note);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.revert",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });

  return NextResponse.json({ application: result.application });
}
