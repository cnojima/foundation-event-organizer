import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MigrationApplicationForm } from "@/components/migration-application-form";
import { getDefaultDestination } from "@/lib/migration-tracker";

export const metadata = { title: "Apply to Migrate" };

export default async function MigrationTrackerSubmitPage() {
  const destination = getDefaultDestination();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        kicker="Migration Tracker"
        title="Apply to migrate"
        subtitle={
          destination
            ? `Server #${destination.serverNumber}`
            : undefined
        }
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">
          This server&apos;s migration tracker hasn&apos;t been configured yet.
        </p>
      ) : (
        <MigrationApplicationForm />
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/migration-tracker" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
          ← Back to the tracker
        </Link>
      </p>
    </div>
  );
}
