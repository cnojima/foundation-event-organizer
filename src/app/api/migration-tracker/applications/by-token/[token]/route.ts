import { NextResponse } from "next/server";
import { editApplicationByToken } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Public, no auth — possession of the token is the authorization, same as
// guildInvites.code. See docs/prd-migration-tracker.md.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: { sourceServer?: string; power?: number; contact?: string | null } = {};

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
  if ("contact" in body) {
    const contact =
      typeof body.contact === "string" && body.contact.trim() !== "" ? body.contact.trim() : null;
    if (contact && contact.length > 120) {
      return NextResponse.json({ error: "Contact is too long" }, { status: 400 });
    }
    updates.contact = contact;
  }

  const result = editApplicationByToken(token, updates);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: null,
    actorDisplay: await resolveActorDisplay(null),
    action: "migration.edit",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
    changes: { after: { tier: result.application.tier, status: result.application.status } },
  });

  return NextResponse.json({
    application: {
      id: result.application.id,
      playerName: result.application.playerName,
      sourceServer: result.application.sourceServer,
      power: result.application.power,
      tier: result.application.tier,
      status: result.application.status,
      contact: result.application.contact,
    },
  });
}
