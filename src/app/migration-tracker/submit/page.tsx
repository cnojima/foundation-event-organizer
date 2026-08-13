import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { MigrationApplicationForm } from "@/components/migration-application-form";
import { getDefaultDestination } from "@/lib/migration-tracker";

export const metadata = { title: "Apply to Migrate" };

export default async function MigrationTrackerSubmitPage() {
  const destination = getDefaultDestination();
  const t = await getTranslations("migrationTrackerSubmit");
  const tShared = await getTranslations("migrationTracker");

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={t("title")}
        subtitle={destination ? t("subtitleServer", { serverNumber: destination.serverNumber }) : undefined}
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">{t("unconfigured")}</p>
      ) : (
        <MigrationApplicationForm />
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/migration-tracker" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
          {tShared("backToTracker")}
        </Link>
      </p>
    </div>
  );
}
