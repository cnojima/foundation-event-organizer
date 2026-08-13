import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationDestinations, migrationOfficers, guilds } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Migration Tracker" };

export default async function AdminMigrationTrackerPage() {
  const session = await auth();
  const membership = requireSignedInPage(session);
  const t = await getTranslations("migrationTrackerAdmin");
  const tShared = await getTranslations("migrationTracker");

  const CLASSIFICATION_LABEL: Record<string, string> = {
    high: tShared("classificationHigh"),
    mid: tShared("classificationMid"),
    low: tShared("classificationLow"),
  };

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
      <PageHeader kicker={t("kicker")} title={t("title")} />

      {destinations.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/admin/migration-tracker/${d.id}`}
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
