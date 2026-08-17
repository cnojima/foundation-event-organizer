import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { reclassifyDestination } from "@/lib/migration-tracker";
import { logAudit, logMigrationDemotions, logMigrationPromotions, resolveActorDisplay } from "@/lib/audit";

const VALID_CLASSIFICATIONS = ["high", "mid", "low"] as const;

// Reclassifying resets all 4 tier caps to the new classification's standard
// defaults (see reclassifyDestination) — the standard table is the default.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;
  const { membership, destination } = guard.value;

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.classification !== "string" ||
    !VALID_CLASSIFICATIONS.includes(body.classification as (typeof VALID_CLASSIFICATIONS)[number])
  ) {
    return NextResponse.json({ error: "classification must be high, mid, or low" }, { status: 400 });
  }

  const result = reclassifyDestination(
    id,
    body.classification as (typeof VALID_CLASSIFICATIONS)[number]
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  const actorDisplay = await resolveActorDisplay(membership.userId);
  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay,
    action: "migration.destination.reclassify",
    entityType: "migration_destination",
    entityId: id,
    entityLabel: `Server #${destination.serverNumber}`,
    changes: {
      before: { classification: destination.classification },
      after: {
        classification: body.classification,
        demotedCount: result.demoted.length,
        promotedCount: result.promoted.length,
      },
    },
  });
  void logMigrationDemotions(result.demoted, membership.userId, actorDisplay);
  void logMigrationPromotions(result.promoted, membership.userId, actorDisplay);

  return NextResponse.json({
    success: true,
    demoted: result.demoted.length,
    promoted: result.promoted.length,
  });
}
