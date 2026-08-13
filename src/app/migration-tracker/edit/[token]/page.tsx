import Link from "next/link";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { MigrationApplicationEditForm } from "@/components/migration-application-edit-form";

export const metadata = { title: "Your Migration Application" };

const STATUS_LABEL: Record<string, string> = {
  applied: "Awaiting officer review.",
  waitlisted: "Waitlisted — that tier's cap is currently reserved.",
  accepted: "Accepted! An Immigration Officer approved this application.",
  denied: "This application was denied.",
  withdrawn: "You withdrew this application.",
  removed_by_admin: "This application was removed by an admin.",
};

export default async function MigrationTrackerEditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const application = await db.query.migrationApplications.findFirst({
    where: eq(migrationApplications.editToken, token),
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader kicker="Migration Tracker" title="Your application" />

      {!application ? (
        <p className="text-gray-500 dark:text-gray-400">
          We couldn&apos;t find an application for this link. It may be wrong, or the
          application may have been removed.
        </p>
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
          ← Back to the tracker
        </Link>
      </p>
    </div>
  );
}
