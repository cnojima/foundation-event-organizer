import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { updateWindowDates } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Correction path for a mistyped open/close date — always allowed, even on
// a closed window (see updateWindowDates for why that's intentional).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const guard = await canManageMigrationDestination(session, id);
  if (!guard.ok) return guard.response;
  const { membership, destination } = guard.value;

  const body = await req.json().catch(() => null);
  const opensAt = typeof body?.opensAt === "string" ? body.opensAt : "";
  const closesAt = typeof body?.closesAt === "string" ? body.closesAt : "";
  if (!opensAt || Number.isNaN(new Date(opensAt).getTime())) {
    return NextResponse.json({ error: "opensAt is required" }, { status: 400 });
  }
  if (!closesAt || Number.isNaN(new Date(closesAt).getTime())) {
    return NextResponse.json({ error: "closesAt is required" }, { status: 400 });
  }

  const result = updateWindowDates(id, opensAt, closesAt);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.destination.dates.update",
    entityType: "migration_destination",
    entityId: id,
    entityLabel: `Server #${destination.serverNumber}`,
    changes: {
      before: { opensAt: destination.opensAt, closesAt: destination.closesAt },
      after: { opensAt, closesAt },
    },
  });

  return NextResponse.json({ success: true });
}
