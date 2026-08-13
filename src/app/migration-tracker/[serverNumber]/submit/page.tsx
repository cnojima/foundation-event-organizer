import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { DateTime } from "@/components/date-time";
import { MigrationApplicationForm } from "@/components/migration-application-form";
import { resolveActiveDestination, getWindowStatus } from "@/lib/migration-tracker";

export const metadata = { title: "Apply to Migrate" };

export default async function MigrationTrackerSubmitPage({
  params,
}: {
  params: Promise<{ serverNumber: string }>;
}) {
  const { serverNumber: serverNumberParam } = await params;
  const serverNumber = Number(serverNumberParam);
  const destination = Number.isInteger(serverNumber) ? resolveActiveDestination(serverNumber) : undefined;
  const status = destination ? getWindowStatus(destination) : null;
  const t = await getTranslations("migrationTrackerSubmit");
  const tShared = await getTranslations("migrationTracker");

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={t("title")}
        subtitle={destination ? tShared("serverLabel", { serverNumber: destination.serverNumber }) : undefined}
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">{t("inactive")}</p>
      ) : status === "upcoming" ? (
        <p className="text-gray-500 dark:text-gray-400">
          {t("notOpenYet")} <DateTime iso={destination.opensAt} />
        </p>
      ) : status === "closed" ? (
        <p className="text-gray-500 dark:text-gray-400">{t("windowClosed")}</p>
      ) : (
        <MigrationApplicationForm serverNumber={destination.serverNumber} />
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link
          href={`/migration-tracker/${serverNumberParam}`}
          className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          {tShared("backToTracker")}
        </Link>
      </p>
    </div>
  );
}
