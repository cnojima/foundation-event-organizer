import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { removeApplication } from "@/lib/migration-tracker";
import { logAudit, logMigrationPromotions, resolveActorDisplay } from "@/lib/audit";

// Data-hygiene removal (spam/duplicate/garbage) — server-admin only, not
// plain officers. Distinct from `deny`, a legitimate immigration decision.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canReviewMigrationApplication(session, id);
  if (!guard.ok) return guard.response;
  const { membership, isServerAdmin } = guard.value;
  if (!isServerAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const result = removeApplication(id, membership.userId, note);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  const actorDisplay = await resolveActorDisplay(membership.userId);
  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay,
    action: "migration.remove",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });
  void logMigrationPromotions(result.promoted, membership.userId, actorDisplay);

  return NextResponse.json({ application: result.application, promoted: result.promoted });
}
