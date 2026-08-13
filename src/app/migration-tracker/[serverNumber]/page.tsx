import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { DateTime } from "@/components/date-time";
import {
  resolveActiveDestination,
  getCapacitySummary,
  getWindowStatus,
  type Tier,
} from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker" };

export default async function MigrationTrackerServerPage({
  params,
}: {
  params: Promise<{ serverNumber: string }>;
}) {
  const { serverNumber: serverNumberParam } = await params;
  const serverNumber = Number(serverNumberParam);
  const destination = Number.isInteger(serverNumber) ? resolveActiveDestination(serverNumber) : undefined;
  const t = await getTranslations("migrationTrackerPage");
  const tShared = await getTranslations("migrationTracker");

  const classificationKey = destination
    ? ({ high: "classificationHigh", mid: "classificationMid", low: "classificationLow" } as const)[
        destination.classification
      ]
    : null;
  const status = destination ? getWindowStatus(destination) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={destination ? tShared("serverLabel", { serverNumber: destination.serverNumber }) : t("titleUnconfigured")}
        subtitle={
          destination && classificationKey
            ? t("subtitle", { classification: tShared(classificationKey) })
            : t("subtitleInactive", { serverNumber: serverNumberParam })
        }
        rightSlot={
          destination && status === "open" ? (
            <Link
              href={`/migration-tracker/${destination.serverNumber}/submit`}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              {t("applyButton")}
            </Link>
          ) : null
        }
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">{t("checkBackSoon")}</p>
      ) : (
        <>
          {status === "upcoming" && (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {t("opensOn")} <DateTime iso={destination.opensAt} />
            </p>
          )}
          <MigrationCapacityTable destinationId={destination.id} />
        </>
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/migration-tracker" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
          {tShared("backToTracker")}
        </Link>
      </p>
    </div>
  );
}

async function MigrationCapacityTable({ destinationId }: { destinationId: string }) {
  const summary = getCapacitySummary(destinationId);
  const t = await getTranslations("migrationTrackerPage");
  const tShared = await getTranslations("migrationTracker");
  const tierLabel: Record<Tier, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 font-semibold">{t("colTier")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colCap")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colReserved")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colRemaining")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colWaitlisted")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.tier} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">
                {tierLabel[row.tier as Tier] ?? row.flavorName}
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{row.cap}</td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.reserved}
              </td>
              <td className="px-3 py-3 text-right">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    row.remaining > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {row.remaining}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.waitlisted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
