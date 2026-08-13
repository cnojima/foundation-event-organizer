import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireSuperAdminApi } from "@/lib/rbac";
import { updateThresholds, TIER_ORDER, type Tier } from "@/lib/migration-tracker";
import { logAudit, resolveActorDisplay } from "@/lib/audit";

// Global (cross-destination), super-admin only. Body: [{ tier, minPower }, ...].
// Re-derives tier on every still-pending (applied/waitlisted) application;
// leaves accepted/denied/withdrawn/removed applications frozen. See
// docs/prd-migration-tracker.md open question #5.
export async function PUT(req: Request) {
  const session = await auth();
  const guard = requireSuperAdminApi(session);
  if (!guard.ok) return guard.response;
  const membership = guard.value;

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an array of { tier, minPower }" }, { status: 400 });
  }

  const updates: { tier: Tier; minPower: number | null }[] = [];
  for (const row of body) {
    if (!row || !TIER_ORDER.includes(row.tier)) {
      return NextResponse.json({ error: "Each row needs a valid tier" }, { status: 400 });
    }
    if (row.minPower !== null && !Number.isFinite(Number(row.minPower))) {
      return NextResponse.json({ error: "minPower must be a number or null" }, { status: 400 });
    }
    updates.push({
      tier: row.tier,
      minPower: row.minPower === null ? null : Math.trunc(Number(row.minPower)),
    });
  }

  updateThresholds(updates);

  void logAudit({
    guildId: null,
    actorUserId: membership.userId,
    actorDisplay: await resolveActorDisplay(membership.userId),
    action: "migration.thresholds.update",
    entityType: "migration_destination",
    entityId: null,
    entityLabel: "Power tier thresholds",
    changes: { after: { updates } },
  });

  return NextResponse.json({ success: true });
}
