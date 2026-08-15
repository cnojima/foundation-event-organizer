import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { getCapacitySummary, getWindowStatus, TIER_ORDER, type Tier } from "@/lib/migration-tracker";
import { findDuplicateMatches } from "@/lib/migration-dedupe";
import { MigrationQueueRow } from "@/components/migration-queue-row";
import { DuplicateBadge, duplicateRowId } from "@/components/migration-duplicate-badge";

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

  const applied = allApplications.filter((a) => a.status === "applied");
  const waitlisted = allApplications.filter((a) => a.status === "waitlisted");

  // Closed windows are read-only, per docs/prd-migration-tracker-multi-server.md
  // §6-7: nothing is actionable once closed, so the queue's job shifts from
  // "review pending applications" to "show the final historical roster" —
  // every application regardless of status, no action buttons.
  const finalRoster = windowClosed
    ? [...allApplications].sort(
        (a, b) => a.tier.localeCompare(b.tier) || a.createdAt.localeCompare(b.createdAt)
      )
    : [];

  const duplicateMatches = findDuplicateMatches(allApplications);

  const APPLICATION_STATUS_LABEL: Record<string, string> = {
    applied: t("statusApplied"),
    waitlisted: t("statusWaitlisted"),
    accepted: t("statusAccepted"),
    denied: t("statusDenied"),
    withdrawn: t("statusWithdrawn"),
    removed_by_admin: t("statusRemoved"),
  };

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

      {windowClosed ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                <th className="px-3 py-2 font-semibold">{t("colTier")}</th>
                <th className="px-3 py-2 font-semibold">{t("colDesiredGuild")}</th>
                <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
                <th className="px-3 py-2 font-semibold">{t("colStatus")}</th>
                <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
              </tr>
            </thead>
            <tbody>
              {finalRoster.map((a) => (
                <tr
                  key={a.id}
                  id={duplicateRowId(a.id)}
                  className="scroll-mt-4 border-t border-gray-100 target:bg-amber-50 dark:border-gray-800 dark:target:bg-amber-950/30"
                >
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                    {a.playerName}
                    <DuplicateBadge matches={duplicateMatches.get(a.id) ?? []} label={t("duplicateBadge")} />
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.sourceServer}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.power.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{tierLabel[a.tier as Tier] ?? a.tier}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.desiredGuild ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.gameUid ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                    {APPLICATION_STATUS_LABEL[a.status] ?? a.status}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        TIER_ORDER.map((tier) => {
        const appliedForTier = applied.filter((a) => a.tier === tier);
        const waitlistedForTier = waitlisted.filter((a) => a.tier === tier);
        if (appliedForTier.length === 0 && waitlistedForTier.length === 0) return null;

        return (
          <div key={tier} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {tierLabel[tier] ?? tier}
            </h2>
            {appliedForTier.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
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
                          desiredGuild: a.desiredGuild,
                          gameUid: a.gameUid,
                          contact: a.contact,
                          createdAt: a.createdAt,
                        }}
                        showRemove={isServerAdmin}
                        duplicates={duplicateMatches.get(a.id) ?? []}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {waitlistedForTier.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {t("waitlistHeading")}
                </p>
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 text-left text-xs uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
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
                            gameUid: a.gameUid,
                            desiredGuild: a.desiredGuild,
                            createdAt: a.createdAt,
                          }}
                          showRemove={isServerAdmin}
                          duplicates={duplicateMatches.get(a.id) ?? []}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })
      )}

      {!windowClosed && applied.length === 0 && waitlisted.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">{t("empty")}</p>
      )}
      {windowClosed && finalRoster.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">{t("emptyRoster")}</p>
      )}
    </div>
  );
}
