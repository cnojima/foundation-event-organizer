import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canReviewMigrationApplication } from "@/lib/rbac";
import { editApplicationByAdmin } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Officer/admin correction path for fields that can be fixed after the fact
// (typos in name/source server, a corrected power reading, game UID,
// desired guild) — distinct from accept/deny/waitlist/remove, which are
// decisions.
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

  const updates: {
    playerName?: string;
    sourceServer?: string;
    power?: number;
    gameUid?: string | null;
    desiredGuild?: string | null;
  } = {};
  if ("playerName" in body) {
    const playerName = typeof body.playerName === "string" ? body.playerName.trim() : "";
    if (!playerName || playerName.length > 60) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }
    updates.playerName = playerName;
  }
  if ("sourceServer" in body) {
    const sourceServer = typeof body.sourceServer === "string" ? body.sourceServer.trim() : "";
    if (!sourceServer || sourceServer.length > 60) {
      return NextResponse.json({ error: "Source server is required" }, { status: 400 });
    }
    updates.sourceServer = sourceServer;
  }
  if ("power" in body) {
    const power = Number(body.power);
    if (!Number.isFinite(power) || power < 0 || !Number.isInteger(power)) {
      return NextResponse.json({ error: "Power must be a whole number" }, { status: 400 });
    }
    updates.power = power;
  }
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
      playerName: result.application.playerName,
      sourceServer: result.application.sourceServer,
      power: result.application.power,
      tier: result.application.tier,
      status: result.application.status,
      gameUid: result.application.gameUid,
      desiredGuild: result.application.desiredGuild,
    },
  });
}
