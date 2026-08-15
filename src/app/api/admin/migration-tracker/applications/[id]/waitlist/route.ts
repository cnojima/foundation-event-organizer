import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { reviewApplication } from "@/lib/migration-tracker";
import { logAudit, logMigrationPromotions, resolveActorDisplay } from "@/lib/audit";

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

  const result = reviewApplication(id, "waitlist", membership.userId, note);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  const actorDisplay = await resolveActorDisplay(membership.userId);
  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay,
    action: "migration.waitlist",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });
  void logMigrationPromotions(result.promoted, membership.userId, actorDisplay);

  return NextResponse.json({ application: result.application, promoted: result.promoted });
}
