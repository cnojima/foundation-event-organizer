import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageMigrationDestination } from "@/lib/rbac";
import { setAllocation, TIER_ORDER, type Tier } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Manual per-tier override, independent of the classification standard
// table. Body: [{ tier, maxSlots }, ...] — any subset of the 4 tiers.
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
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an array of { tier, maxSlots }" }, { status: 400 });
  }

  const updates: { tier: Tier; maxSlots: number }[] = [];
  for (const row of body) {
    if (!row || !TIER_ORDER.includes(row.tier) || !Number.isFinite(Number(row.maxSlots))) {
      return NextResponse.json({ error: "Each row needs a valid tier and maxSlots" }, { status: 400 });
    }
    const maxSlots = Math.trunc(Number(row.maxSlots));
    if (maxSlots < 0) {
      return NextResponse.json({ error: "maxSlots can't be negative" }, { status: 400 });
    }
    updates.push({ tier: row.tier, maxSlots });
  }

  for (const u of updates) {
    const result = setAllocation(id, u.tier, u.maxSlots);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }
  }

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.destination.allocations.update",
    entityType: "migration_destination",
    entityId: id,
    entityLabel: `Server #${destination.serverNumber}`,
    changes: { after: { updates } },
  });

  return NextResponse.json({ success: true });
}
