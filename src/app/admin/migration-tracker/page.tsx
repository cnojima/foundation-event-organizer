import Link from "next/link";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationDestinations, migrationOfficers, guilds } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Migration Tracker" };

const CLASSIFICATION_LABEL: Record<string, string> = {
  high: "High-power server",
  mid: "Mid-power server",
  low: "Low-power server",
};

export default async function AdminMigrationTrackerPage() {
  const session = await auth();
  const membership = requireSignedInPage(session);

  let destinations: (typeof migrationDestinations.$inferSelect)[] = [];

  if (membership.isSuperAdmin) {
    destinations = await db.select().from(migrationDestinations).orderBy(migrationDestinations.serverNumber);
  } else if (membership.guildRole === "admin" && membership.guildId) {
    const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, membership.guildId) });
    if (guild?.serverNumber) {
      destinations = await db
        .select()
        .from(migrationDestinations)
        .where(eq(migrationDestinations.serverNumber, guild.serverNumber));
    }
  } else {
    const officerRows = await db
      .select({ destinationId: migrationOfficers.destinationId })
      .from(migrationOfficers)
      .where(eq(migrationOfficers.userId, membership.userId));
    const ids = officerRows.map((r) => r.destinationId);
    if (ids.length > 0) {
      destinations = await db
        .select()
        .from(migrationDestinations)
        .where(inArray(migrationDestinations.id, ids));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Admin" title="Migration Tracker" />

      {destinations.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          You don&apos;t manage any migration destinations. Guild admins on a
          destination&apos;s server, and anyone appointed as an Immigration
          Officer, can review applications here.
        </p>
      ) : (
        <div className="space-y-3">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/admin/migration-tracker/${d.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-700"
            >
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Server #{d.serverNumber}
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
