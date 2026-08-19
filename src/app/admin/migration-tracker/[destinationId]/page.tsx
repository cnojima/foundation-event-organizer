import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { getCapacitySummary, getWindowStatus, type Tier } from "@/lib/migration-tracker";
import { findDuplicateMatches } from "@/lib/migration-dedupe";
import { MigrationAdminQueue, type AdminQueueRow } from "@/components/migration-tracker/migration-admin-queue";

export const metadata = { title: "Migration Review Queue" };

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
  const t = await getTranslations("migrationTrackerQueue");
  const tShared = await getTranslations("migrationTracker");
  const tierLabel: Record<Tier, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };

  const summary = getCapacitySummary(destination.id);
  const windowClosed = getWindowStatus(destination) === "closed";

  // Single fetch of every application for this destination, regardless of
  // status — applied/waitlisted/finalRoster are all derived from it below,
  // and duplicate detection needs the full set (a duplicate may span
  // statuses, e.g. one already-accepted application and one freshly applied).
  const allApplications = await db
    .select()
    .from(migrationApplications)
    .where(eq(migrationApplications.destinationId, destination.id))
    .orderBy(asc(migrationApplications.createdAt));

  const duplicateMatches = findDuplicateMatches(allApplications);

  // Rows for the client-side queue/roster view (search + collapsible tier
  // sections both need to filter/toggle without a round trip). Closed
  // windows are read-only, per docs/prd-migration-tracker-multi-server.md
  // §6-7: nothing is actionable once closed, so the queue's job shifts from
  // "review pending applications" to "show the final historical roster" —
  // every application regardless of status, no action buttons. The
  // component itself decides which statuses are relevant per mode.
  const rows: AdminQueueRow[] = allApplications.map((a) => ({
    id: a.id,
    playerName: a.playerName,
    sourceServer: a.sourceServer,
    power: a.power,
    tier: a.tier as Tier,
    desiredGuild: a.desiredGuild,
    gameUid: a.gameUid,
    contact: a.contact,
    createdAt: a.createdAt,
    status: a.status,
    duplicates: duplicateMatches.get(a.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={t("title", { serverNumber: destination.serverNumber })}
        rightSlot={
          <div className="flex gap-2">
            <Link
              href={`/admin/migration-tracker/${destination.id}/import`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t("importLink")}
            </Link>
            <Link
              href={`/admin/migration-tracker/${destination.id}/audit`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t("auditLink")}
            </Link>
            {isServerAdmin && (
              <>
                <Link
                  href={`/admin/migration-tracker/${destination.id}/officers`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t("officersLink")}
                </Link>
                <Link
                  href={`/admin/migration-tracker/${destination.id}/settings`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t("settingsLink")}
                </Link>
              </>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((row) => (
          <div key={row.tier} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {tierLabel[row.tier as Tier] ?? row.flavorName}
            </p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
              {row.reserved}/{row.cap}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {row.remaining >= 0 ? t("left", { count: row.remaining }) : t("overCap", { count: -row.remaining })} ·{" "}
              {t("waitlistedCount", { count: row.waitlisted })}
            </p>
          </div>
        ))}
      </div>

      {windowClosed && (
        <div className="mb-3 rounded-md border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          {t("closedNotice")}
        </div>
      )}

      <MigrationAdminQueue
        rows={rows}
        windowClosed={windowClosed}
        tierLabel={tierLabel}
        isServerAdmin={isServerAdmin}
      />
    </div>
  );
}
