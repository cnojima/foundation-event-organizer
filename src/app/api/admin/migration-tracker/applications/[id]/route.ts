import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { editApplicationByAdmin } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Officer/admin correction path for reference fields (game UID, desired
// guild) that don't affect capacity or review status — distinct from
// accept/deny/waitlist/remove, which are decisions.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canReviewMigrationApplication(session, id);
  if (!guard.ok) return guard.response;
  const { membership } = guard.value;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: { gameUid?: string | null; desiredGuild?: string | null } = {};
  if ("gameUid" in body) {
    const gameUid =
      typeof body.gameUid === "string" && body.gameUid.trim() !== "" ? body.gameUid.trim() : null;
    if (gameUid && gameUid.length > 60) {
      return NextResponse.json({ error: "Game UID is too long" }, { status: 400 });
    }
    updates.gameUid = gameUid;
  }
  if ("desiredGuild" in body) {
    const desiredGuild =
      typeof body.desiredGuild === "string" && body.desiredGuild.trim() !== ""
        ? body.desiredGuild.trim()
        : null;
    if (desiredGuild && desiredGuild.length > 60) {
      return NextResponse.json({ error: "Desired guild is too long" }, { status: 400 });
    }
    updates.desiredGuild = desiredGuild;
  }

  const result = editApplicationByAdmin(id, updates);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.admin_edit",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });

  return NextResponse.json({
    application: {
      id: result.application.id,
      gameUid: result.application.gameUid,
      desiredGuild: result.application.desiredGuild,
    },
  });
}
