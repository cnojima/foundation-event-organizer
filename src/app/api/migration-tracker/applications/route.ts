import { NextResponse } from "next/server";
import { resolveActiveDestination, submitApplication } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Public, no auth — anyone can apply to migrate. See
// docs/prd-migration-tracker.md and docs/prd-migration-tracker-multi-server.md.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const serverNumber = Number(body.serverNumber);
  const playerName = typeof body.playerName === "string" ? body.playerName.trim() : "";
  const sourceServer = typeof body.sourceServer === "string" ? body.sourceServer.trim() : "";
  const power = Number(body.power);
  const desiredGuild =
    typeof body.desiredGuild === "string" && body.desiredGuild.trim() !== ""
      ? body.desiredGuild.trim()
      : null;
  const gameUid = typeof body.gameUid === "string" ? body.gameUid.trim() : "";
  const contact =
    typeof body.contact === "string" && body.contact.trim() !== "" ? body.contact.trim() : null;

  if (!Number.isInteger(serverNumber)) {
    return NextResponse.json({ error: "serverNumber is required" }, { status: 400 });
  }
  if (!playerName || playerName.length > 60) {
    return NextResponse.json({ error: "Player name is required" }, { status: 400 });
  }
  if (!sourceServer || sourceServer.length > 60) {
    return NextResponse.json({ error: "Source server is required" }, { status: 400 });
  }
  if (!Number.isFinite(power) || power < 0 || !Number.isInteger(power)) {
    return NextResponse.json({ error: "Power must be a whole number" }, { status: 400 });
  }
  if (desiredGuild && desiredGuild.length > 60) {
    return NextResponse.json({ error: "Desired guild is too long" }, { status: 400 });
  }
  if (!gameUid || gameUid.length > 60) {
    return NextResponse.json({ error: "Game UID is required" }, { status: 400 });
  }
  if (contact && contact.length > 120) {
    return NextResponse.json({ error: "Contact is too long" }, { status: 400 });
  }

  const destination = resolveActiveDestination(serverNumber);
  if (!destination) {
    return NextResponse.json(
      { error: "No open migration window for this server" },
      { status: 409 }
    );
  }

  const result = submitApplication({
    destinationId: destination.id,
    playerName,
    sourceServer,
    power,
    desiredGuild,
    gameUid,
    contact,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: null,
    actorDisplay: await resolveActorDisplay(null),
    action: "migration.submit",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
    changes: { after: { tier: result.application.tier, status: result.application.status } },
  });

  return NextResponse.json(
    {
      application: {
        id: result.application.id,
        playerName: result.application.playerName,
        sourceServer: result.application.sourceServer,
        power: result.application.power,
        tier: result.application.tier,
        status: result.application.status,
        createdAt: result.application.createdAt,
      },
      editToken: result.editToken,
    },
    { status: 201 }
  );
}
