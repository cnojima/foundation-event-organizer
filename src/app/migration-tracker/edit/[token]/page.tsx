import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { MigrationApplicationEditForm } from "@/components/migration-application-edit-form";

export const metadata = { title: "Your Migration Application" };

export default async function MigrationTrackerEditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const application = await db.query.migrationApplications.findFirst({
    where: eq(migrationApplications.editToken, token),
  });
  const t = await getTranslations("migrationTrackerEdit");
  const tShared = await getTranslations("migrationTracker");

  const STATUS_LABEL: Record<string, string> = {
    applied: t("statusApplied"),
    waitlisted: t("statusWaitlisted"),
    accepted: t("statusAccepted"),
    denied: t("statusDenied"),
    withdrawn: t("statusWithdrawn"),
    removed_by_admin: t("statusRemoved"),
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader kicker={tShared("kicker")} title={t("title")} />

      {!application ? (
        <p className="text-gray-500 dark:text-gray-400">{t("notFound")}</p>
      ) : application.status === "applied" || application.status === "waitlisted" ? (
        <MigrationApplicationEditForm
          token={token}
          application={{
            playerName: application.playerName,
            sourceServer: application.sourceServer,
            power: application.power,
            contact: application.contact,
            tier: application.tier,
            status: application.status,
          }}
        />
      ) : (
        <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{application.playerName}</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {STATUS_LABEL[application.status] ?? application.status}
          </p>
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link
          href="/migration-tracker"
          className="font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          {tShared("backToTracker")}
        </Link>
      </p>
    </div>
  );
}
