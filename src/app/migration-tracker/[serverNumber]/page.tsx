import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { DateTime } from "@/components/date-time";
import { InfoTipIcon } from "@/components/info-tip";
import { GameUidCell } from "@/components/migration-tracker/migration-game-uid-cell";
import { db } from "@/db";
import { migrationApplications } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  resolveActiveDestination,
  getCapacitySummary,
  getClassificationStandards,
  getWindowStatus,
  TIER_ORDER,
  type Tier,
} from "@/lib/migration-tracker";

export const metadata = { title: "Migration Tracker" };

export default async function MigrationTrackerServerPage({
  params,
}: {
  params: Promise<{ serverNumber: string }>;
}) {
  const { serverNumber: serverNumberParam } = await params;
  const serverNumber = Number(serverNumberParam);
  const destination = Number.isInteger(serverNumber) ? resolveActiveDestination(serverNumber) : undefined;
  const t = await getTranslations("migrationTrackerPage");
  const tShared = await getTranslations("migrationTracker");

  const classificationKey = destination
    ? ({ high: "classificationHigh", mid: "classificationMid", low: "classificationLow" } as const)[
        destination.classification
      ]
    : null;
  const classificationTagKey = destination
    ? (
        {
          high: "classificationTagHigh",
          mid: "classificationTagMid",
          low: "classificationTagLow",
        } as const
      )[destination.classification]
    : null;
  const status = destination ? getWindowStatus(destination) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker={tShared("kicker")}
        title={
          destination ? (
            <>
              {tShared("serverLabel", { serverNumber: destination.serverNumber })}{" "}
              {classificationTagKey && (
                <span className="text-lg font-semibold text-violet-600 sm:text-xl dark:text-violet-300">
                  {tShared(classificationTagKey)}
                </span>
              )}
            </>
          ) : (
            t("titleUnconfigured")
          )
        }
        subtitle={
          destination && classificationKey
            ? t("subtitle", { classification: tShared(classificationKey) })
            : t("subtitleInactive", { serverNumber: serverNumberParam })
        }
        rightSlot={
          destination && status === "open" ? (
            <Link
              href={`/migration-tracker/${destination.serverNumber}/submit`}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              {t("applyButton")}
            </Link>
          ) : null
        }
      />

      {!destination ? (
        <p className="text-gray-500 dark:text-gray-400">{t("checkBackSoon")}</p>
      ) : (
        <>
          {status === "upcoming" && (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {t("opensOn")} <DateTime iso={destination.opensAt} />
            </p>
          )}
          <ClassificationLegend />
          <MigrationCapacityTable destinationId={destination.id} />
          <MigrationApplicantRoster destinationId={destination.id} windowClosed={status === "closed"} />
        </>
      )}

      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/migration-tracker" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
          {tShared("backToTracker")}
        </Link>
      </p>
    </div>
  );
}

// Explains the global classification standard (how many inbound slots each
// tier gets on a high/mid/low-power server) — not specific to this
// destination, since a destination's own allocations can be overridden
// afterward. Hidden behind an info icon so it doesn't compete with the
// destination's actual numbers in the table below.
async function ClassificationLegend() {
  const t = await getTranslations("migrationTrackerPage");
  const [high, mid, low] = getClassificationStandards();

  const params = (slotsByTier: Record<Tier, number>) => ({
    ultraHigh: slotsByTier.ultra_high,
    high: slotsByTier.high,
    mid: slotsByTier.mid,
    low: slotsByTier.low,
  });

  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span>{t("classificationLegendLabel")}</span>
      <InfoTipIcon
        label={t("classificationLegendLabel")}
        placement="bottom"
        content={
          <ul className="space-y-1.5">
            <li>{t("classificationLegendHigh", params(high.slotsByTier))}</li>
            <li>{t("classificationLegendMid", params(mid.slotsByTier))}</li>
            <li>{t("classificationLegendLow", params(low.slotsByTier))}</li>
          </ul>
        }
      />
    </div>
  );
}

async function MigrationCapacityTable({ destinationId }: { destinationId: string }) {
  const summary = getCapacitySummary(destinationId);
  const t = await getTranslations("migrationTrackerPage");
  const tShared = await getTranslations("migrationTracker");
  const tierLabel: Record<Tier, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          <tr>
            <th className="px-3 py-2 font-semibold">{t("colTier")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colCap")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colReserved")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colRemaining")}</th>
            <th className="px-3 py-2 text-right font-semibold">{t("colWaitlisted")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row, i) => (
            <tr key={row.tier} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">
                <span className="inline-flex items-center gap-1.5">
                  {tierLabel[row.tier as Tier] ?? row.flavorName}
                  <InfoTipIcon
                    label={t("tierLegendLabel", { tier: tierLabel[row.tier as Tier] ?? row.flavorName })}
                    placement="bottom"
                    content={
                      row.minPower !== null
                        ? t("tierLegendAtLeast", { power: row.minPower.toLocaleString() })
                        : t("tierLegendBelow", {
                            power: (summary[i - 1]?.minPower ?? 0).toLocaleString(),
                          })
                    }
                  />
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{row.cap}</td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.reserved}
              </td>
              <td className="px-3 py-3 text-right">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    row.remaining > 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                  }`}
                >
                  {row.remaining}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                {row.waitlisted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Read-only roster for the public page — same rows the admin queue shows,
// minus contact info and the accept/waitlist/deny/remove actions. While a
// window is open/upcoming that's applied+waitlisted grouped by tier; once
// closed it flips to the full final roster (every status), matching the
// admin queue's own open-vs-closed split.
async function MigrationApplicantRoster({
  destinationId,
  windowClosed,
}: {
  destinationId: string;
  windowClosed: boolean;
}) {
  const t = await getTranslations("migrationTrackerQueue");
  const tShared = await getTranslations("migrationTracker");
  const tPage = await getTranslations("migrationTrackerPage");
  const tierLabel: Record<Tier, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };
  const summaryByTier = new Map(getCapacitySummary(destinationId).map((s) => [s.tier, s] as const));

  if (windowClosed) {
    const finalRoster = await db
      .select()
      .from(migrationApplications)
      .where(eq(migrationApplications.destinationId, destinationId))
      .orderBy(asc(migrationApplications.tier), asc(migrationApplications.createdAt));

    if (finalRoster.length === 0) {
      return <p className="mt-6 text-gray-500 dark:text-gray-400">{t("emptyRoster")}</p>;
    }

    const statusLabel: Record<string, string> = {
      applied: t("statusApplied"),
      waitlisted: t("statusWaitlisted"),
      accepted: t("statusAccepted"),
      denied: t("statusDenied"),
      withdrawn: t("statusWithdrawn"),
      removed_by_admin: t("statusRemoved"),
    };

    return (
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
              <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
              <th className="px-3 py-2 font-semibold">{t("colTier")}</th>
              <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
              <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
              <th className="px-3 py-2 font-semibold">{t("colStatus")}</th>
              <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
            </tr>
          </thead>
          <tbody>
            {finalRoster.map((a) => (
              <tr key={a.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{a.playerName}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.sourceServer}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                  {tierLabel[a.tier as Tier] ?? a.tier}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.power.toLocaleString()}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                  <GameUidCell gameUid={a.gameUid} missingLabel={t("missingGameUid")} hideValue />
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                  {statusLabel[a.status] ?? a.status}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {new Date(a.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = await db
    .select()
    .from(migrationApplications)
    .where(
      and(
        eq(migrationApplications.destinationId, destinationId),
        inArray(migrationApplications.status, ["applied", "waitlisted"])
      )
    )
    .orderBy(asc(migrationApplications.createdAt));

  const applied = rows.filter((a) => a.status === "applied");
  const waitlisted = rows.filter((a) => a.status === "waitlisted");

  if (applied.length === 0 && waitlisted.length === 0) {
    return <p className="mt-6 text-gray-500 dark:text-gray-400">{t("empty")}</p>;
  }

  return (
    <div className="mt-6">
      {TIER_ORDER.map((tier, tierIndex) => {
        const appliedForTier = applied.filter((a) => a.tier === tier);
        const waitlistedForTier = waitlisted.filter((a) => a.tier === tier);
        if (appliedForTier.length === 0 && waitlistedForTier.length === 0) return null;

        const minPower = summaryByTier.get(tier)?.minPower ?? null;
        const previousMinPower = summaryByTier.get(TIER_ORDER[tierIndex - 1])?.minPower ?? 0;

        return (
          <div key={tier} className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {tierLabel[tier] ?? tier}
              <InfoTipIcon
                label={tPage("tierLegendLabel", { tier: tierLabel[tier] ?? tier })}
                placement="bottom"
                content={
                  minPower !== null
                    ? tPage("tierLegendAtLeast", { power: minPower.toLocaleString() })
                    : tPage("tierLegendBelow", { power: previousMinPower.toLocaleString() })
                }
              />
            </h2>
            {appliedForTier.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <RosterRows t={t} rows={appliedForTier} />
              </div>
            )}
            {waitlistedForTier.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {t("waitlistHeading")}
                </p>
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <RosterRows t={t} rows={waitlistedForTier} amber />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type RosterApplication = {
  id: string;
  playerName: string;
  sourceServer: string;
  power: number;
  gameUid: string | null;
  createdAt: string;
};

function RosterRows({
  t,
  rows,
  amber,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"migrationTrackerQueue">>>;
  rows: RosterApplication[];
  amber?: boolean;
}) {
  const headClass = amber
    ? "bg-amber-50 text-left text-xs uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
    : "bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400";
  return (
    <table className="w-full text-sm">
      <thead className={headClass}>
        <tr>
          <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
          <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
          <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
          <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
          <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-t border-gray-100 dark:border-gray-800">
            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{a.playerName}</td>
            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.sourceServer}</td>
            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.power.toLocaleString()}</td>
            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
              <GameUidCell gameUid={a.gameUid} missingLabel={t("missingGameUid")} hideValue />
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              {new Date(a.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
