import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { db } from "@/db";
import { migrationDestinations, migrationOfficers, guilds } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { DateTime } from "@/components/date-time";
import { getWindowStatus, type WindowStatus } from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker" };

const STATUS_PILL_CLASS: Record<WindowStatus, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  upcoming: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  closed: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
};

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
  const STATUS_LABEL: Record<WindowStatus, string> = {
    open: tShared("statusOpen"),
    upcoming: tShared("statusUpcoming"),
    closed: tShared("statusClosed"),
  };

  let destinations: (typeof migrationDestinations.$inferSelect)[] = [];

  if (membership.isSuperAdmin) {
    destinations = await db
      .select()
      .from(migrationDestinations)
      .orderBy(desc(migrationDestinations.opensAt));
  } else if (membership.guildRole === "admin" && membership.guildId) {
    const guild = await db.query.guilds.findFirst({ where: eq(guilds.id, membership.guildId) });
    if (guild?.serverNumber) {
      destinations = await db
        .select()
        .from(migrationDestinations)
        .where(eq(migrationDestinations.serverNumber, guild.serverNumber))
        .orderBy(desc(migrationDestinations.opensAt));
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
        .where(inArray(migrationDestinations.id, ids))
        .orderBy(desc(migrationDestinations.opensAt));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        rightSlot={
          membership.isSuperAdmin ? (
            <Link
              href="/super-admin/migration-tracker/new"
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              {t("newWindow")}
            </Link>
          ) : null
        }
      />

      {destinations.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {destinations.map((d) => {
            const status = getWindowStatus(d);
            return (
              <Link
                key={d.id}
                href={`/admin/migration-tracker/${d.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {tShared("serverLabel", { serverNumber: d.serverNumber })}
                  </p>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL_CLASS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {CLASSIFICATION_LABEL[d.classification]}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <DateTime iso={d.opensAt} mode="date" /> – <DateTime iso={d.closesAt} mode="date" />
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
