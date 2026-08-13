import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireMigrationDestinationReviewPage } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { MigrationImportForm } from "@/components/migration-import-form";
import { getWindowStatus } from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker — Import" };

export default async function MigrationDestinationImportPage({
  params,
}: {
  params: Promise<{ destinationId: string }>;
}) {
  const { destinationId } = await params;
  const session = await auth();
  const { destination } = await requireMigrationDestinationReviewPage(session, destinationId);

  const t = await getTranslations("migrationTrackerImport");
  const tShared = await getTranslations("migrationTracker");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={tShared("kicker")} title={t("title", { serverNumber: destination.serverNumber })} />
      <MigrationImportForm
        destinationId={destination.id}
        windowOpen={getWindowStatus(destination) === "open"}
      />
    </div>
  );
}
