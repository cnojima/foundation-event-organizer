import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { getActiveDestinations } from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker" };

export default async function MigrationTrackerIndexPage() {
  const destinations = getActiveDestinations();
  const t = await getTranslations("migrationTrackerIndex");
  const tShared = await getTranslations("migrationTracker");

  const CLASSIFICATION_LABEL: Record<string, string> = {
    high: tShared("classificationHigh"),
    mid: tShared("classificationMid"),
    low: tShared("classificationLow"),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker={tShared("kicker")} title={t("title")} subtitle={t("subtitle")} />

      {destinations.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/migration-tracker/${d.serverNumber}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-700"
            >
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {tShared("serverLabel", { serverNumber: d.serverNumber })}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {CLASSIFICATION_LABEL[d.classification]}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
