import Link from "next/link";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { getCapacitySummary, TIER_ORDER } from "@/lib/migration-tracker";
import { MigrationQueueRow } from "@/components/migration-queue-row";

export const metadata = { title: "Migration Review Queue" };

const TIER_FLAVOR_LABEL: Record<string, string> = {
  ultra_high: "Revivalist",
  high: "Contributor",
  mid: "Pioneer",
  low: "Follower",
};

export default async function MigrationDestinationQueuePage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  const session = await auth();
  const { destination, isServerAdmin } = await requireMigrationDestinationReviewPage(
    session,
    destinationId
  );

  const summary = getCapacitySummary(destination.id);

  const applied = await db
    .select()
    .from(migrationApplications)
    .where(and(eq(migrationApplications.destinationId, destination.id), eq(migrationApplications.status, "applied")))
    .orderBy(asc(migrationApplications.createdAt));

  const waitlisted = await db
    .select()
    .from(migrationApplications)
    .where(and(eq(migrationApplications.destinationId, destination.id), eq(migrationApplications.status, "waitlisted")))
    .orderBy(asc(migrationApplications.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        kicker="Admin"
        title={`Server #${destination.serverNumber} — Review queue`}
        rightSlot={
          isServerAdmin ? (
            <div className="flex gap-2">
              <Link
                href={`/admin/migration-tracker/${destination.id}/officers`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Officers
              </Link>
              <Link
                href={`/admin/migration-tracker/${destination.id}/settings`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Settings
              </Link>
            </div>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((row) => (
          <div key={row.tier} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {row.flavorName}
            </p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
              {row.reserved}/{row.cap}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {row.remaining >= 0 ? `${row.remaining} left` : `${-row.remaining} over cap`} ·{" "}
              {row.waitlisted} waitlisted
            </p>
          </div>
        ))}
      </div>

      {TIER_ORDER.map((tier) => {
        const appliedForTier = applied.filter((a) => a.tier === tier);
        const waitlistedForTier = waitlisted.filter((a) => a.tier === tier);
        if (appliedForTier.length === 0 && waitlistedForTier.length === 0) return null;

        return (
          <div key={tier} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {TIER_FLAVOR_LABEL[tier] ?? tier}
            </h2>
            {appliedForTier.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Player</th>
                      <th className="px-3 py-2 font-semibold">Source server</th>
                      <th className="px-3 py-2 font-semibold">Power</th>
                      <th className="px-3 py-2 font-semibold">Applied</th>
                      <th className="px-3 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appliedForTier.map((a) => (
                      <MigrationQueueRow
                        key={a.id}
                        application={{
                          id: a.id,
                          playerName: a.playerName,
                          sourceServer: a.sourceServer,
                          power: a.power,
                          contact: a.contact,
                          createdAt: a.createdAt,
                        }}
                        showRemove={isServerAdmin}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {waitlistedForTier.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Waitlist
                </p>
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 text-left text-xs uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Player</th>
                        <th className="px-3 py-2 font-semibold">Source server</th>
                        <th className="px-3 py-2 font-semibold">Power</th>
                        <th className="px-3 py-2 font-semibold">Applied</th>
                        <th className="px-3 py-2 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlistedForTier.map((a) => (
                        <MigrationQueueRow
                          key={a.id}
                          application={{
                            id: a.id,
                            playerName: a.playerName,
                            sourceServer: a.sourceServer,
                            power: a.power,
                            contact: a.contact,
                            createdAt: a.createdAt,
                          }}
                          showRemove={isServerAdmin}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {applied.length === 0 && waitlisted.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">No pending applications.</p>
      )}
    </div>
  );
}
