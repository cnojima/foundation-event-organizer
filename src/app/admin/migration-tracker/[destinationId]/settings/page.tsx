import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationAllocations, powerTierThresholds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { TIER_ORDER } from "@/lib/migration-tracker";
import { MigrationSettingsForm } from "@/components/migration-settings-form";

export const metadata = { title: "Migration Tracker — Settings" };

export default async function MigrationDestinationSettingsPage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  const session = await auth();
  const { membership, destination, isServerAdmin } = await requireMigrationDestinationReviewPage(
    session,
    destinationId
  );
  if (!isServerAdmin) redirect(`/admin/migration-tracker/${destinationId}`);

  const allocationRows = await db
    .select()
    .from(migrationAllocations)
    .where(eq(migrationAllocations.destinationId, destination.id));
  const allocations = TIER_ORDER.map((tier) => ({
    tier,
    maxSlots: allocationRows.find((a) => a.tier === tier)?.maxSlots ?? 0,
  }));

  const thresholdRows = await db.select().from(powerTierThresholds);
  const thresholds = TIER_ORDER.map((tier) => {
    const row = thresholdRows.find((t) => t.tier === tier);
    return { tier, flavorName: row?.flavorName ?? tier, minPower: row?.minPower ?? null };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader kicker="Admin" title={`Server #${destination.serverNumber} — Settings`} />
      <MigrationSettingsForm
        destinationId={destination.id}
        classification={destination.classification}
        allocations={allocations}
        thresholds={thresholds}
        canEditThresholds={membership.isSuperAdmin}
      />
    </div>
  );
}
