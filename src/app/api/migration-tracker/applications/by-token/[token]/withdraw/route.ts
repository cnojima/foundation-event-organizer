import { NextResponse } from "next/server";
import { withdrawApplicationByToken } from "@/lib/migration-tracker";
import { logAudit, logMigrationPromotions, resolveActorDisplay } from "@/lib/audit";

// Public, no auth — possession of the token is the authorization.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = withdrawApplicationByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: null,
    actorDisplay: await resolveActorDisplay(null),
    action: "migration.withdraw",
    entityType: "migration_application",
    entityId: result.application.id,
    entityLabel: result.application.playerName,
  });
  void logMigrationPromotions(result.promoted, null, "(system)");

  return NextResponse.json({ success: true });
}
