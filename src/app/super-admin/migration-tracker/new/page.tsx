import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { MigrationCreateDestinationForm } from "@/components/migration-create-destination-form";

export const metadata = { title: "New Migration Window" };

export default async function NewMigrationDestinationPage() {
  const session = await auth();
  requireSuperAdminPage(session);

  const t = await getTranslations("migrationTrackerCreate");
  const tShared = await getTranslations("migrationTracker");

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader kicker={tShared("kicker")} title={t("title")} subtitle={t("subtitle")} />
      <MigrationCreateDestinationForm />
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link
          href="/admin/migration-tracker"
          className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          {t("backToOverview")}
        </Link>
      </p>
    </div>
  );
}
