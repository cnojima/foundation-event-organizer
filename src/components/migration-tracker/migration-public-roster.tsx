"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { InfoTipIcon } from "@/components/info-tip";
import { GameUidCell } from "@/components/migration-tracker/migration-game-uid-cell";
import { TIER_ORDER, type Tier } from "@/lib/migration-tracker-types";

export type PublicRosterRow = {
  id: string;
  playerName: string;
  sourceServer: string;
  power: number;
  tier: Tier;
  // Never the real UID — see hasGameUid below. Keeping the actual value off
  // the client entirely (not just visually hidden) is the point: it never
  // enters the RSC payload sent to the browser, so it can't be read from
  // view-source or dev tools either.
  hasGameUid: boolean;
  createdAt: string;
  status: string;
};

type TierInfo = { label: string; tipLabel: string; tipContent: string };

function matchesQuery(row: PublicRosterRow, query: string): boolean {
  if (!query) return true;
  return (
    row.playerName.toLowerCase().includes(query) || row.sourceServer.toLowerCase().includes(query)
  );
}

// Read-only public roster — same shape as the admin queue's collapsible
// tier + search treatment, minus contact info, desired guild, real UID
// values, and all review actions. Search covers name + source server only:
// unlike the admin queue, this list has no other field an anonymous visitor
// should be able to probe (a UID or guild match here would just be a worse
// version of the admin tool, without any of the reasons an officer needs it).
export function MigrationPublicRoster({
  rows,
  windowClosed,
  tierInfo,
}: {
  rows: PublicRosterRow[];
  windowClosed: boolean;
  tierInfo: Record<Tier, TierInfo>;
}) {
  const t = useTranslations("migrationTrackerQueue");
  const [query, setQuery] = useState("");
  const [manuallyClosed, setManuallyClosed] = useState<Set<Tier>>(() => new Set());

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery !== "";

  function toggleTier(tier: Tier, open: boolean) {
    setManuallyClosed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  const relevantRows = windowClosed
    ? rows
    : rows.filter((r) => r.status === "applied" || r.status === "waitlisted");

  if (relevantRows.length === 0) {
    return <p className="mt-6 text-gray-500 dark:text-gray-400">{t(windowClosed ? "emptyRoster" : "empty")}</p>;
  }

  const statusLabel: Record<string, string> = {
    applied: t("statusApplied"),
    waitlisted: t("statusWaitlisted"),
    accepted: t("statusAccepted"),
    denied: t("statusDenied"),
    withdrawn: t("statusWithdrawn"),
    removed_by_admin: t("statusRemoved"),
  };

  const matched = relevantRows.filter((r) => matchesQuery(r, normalizedQuery));

  return (
    <div className="mt-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholderPublic")}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
      {TIER_ORDER.map((tier) => {
        const tierRows = relevantRows.filter((r) => r.tier === tier);
        if (tierRows.length === 0) return null;
        const tierMatches = matched
          .filter((r) => r.tier === tier)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (searching && tierMatches.length === 0) return null;
        const open = searching ? true : !manuallyClosed.has(tier);
        const info = tierInfo[tier];

        const appliedForTier = tierMatches.filter((r) => r.status === "applied");
        const waitlistedForTier = tierMatches.filter((r) => r.status === "waitlisted");

        return (
          <details
            key={tier}
            open={open}
            onToggle={(e) => toggleTier(tier, e.currentTarget.open)}
            className="group mb-6"
          >
            <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 [&::-webkit-details-marker]:hidden dark:text-gray-400">
              <Chevron />
              {info?.label ?? tier}
              {info && (
                <InfoTipIcon label={info.tipLabel} placement="bottom" content={info.tipContent} />
              )}
              <span className="text-xs font-normal normal-case text-gray-400 dark:text-gray-500">
                {searching ? t("matchCount", { count: tierMatches.length, total: tierRows.length }) : tierRows.length}
              </span>
            </summary>
            <div className="mt-2">
              {windowClosed ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colStatus")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tierMatches.map((a) => (
                        <RosterRow key={a.id} row={a} t={t} statusLabel={statusLabel} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  {appliedForTier.length > 0 && (
                    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                      <RosterTable rows={appliedForTier} t={t} />
                    </div>
                  )}
                  {waitlistedForTier.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        {t("waitlistHeading")}
                      </p>
                      <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
                        <RosterTable rows={waitlistedForTier} t={t} amber />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
        );
      })}
      {searching && matched.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400">{t("noSearchResults")}</p>
      )}
    </div>
  );
}

function RosterTable({
  rows,
  t,
  amber,
}: {
  rows: PublicRosterRow[];
  t: ReturnType<typeof useTranslations<"migrationTrackerQueue">>;
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
              <GameUidCell gameUid={a.hasGameUid ? "•" : null} missingLabel={t("missingGameUid")} hideValue />
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

function RosterRow({
  row,
  t,
  statusLabel,
}: {
  row: PublicRosterRow;
  t: ReturnType<typeof useTranslations<"migrationTrackerQueue">>;
  statusLabel: Record<string, string>;
}) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{row.playerName}</td>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.sourceServer}</td>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.power.toLocaleString()}</td>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
        <GameUidCell gameUid={row.hasGameUid ? "•" : null} missingLabel={t("missingGameUid")} hideValue />
      </td>
      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{statusLabel[row.status] ?? row.status}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {new Date(row.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-3.5 shrink-0 text-gray-400 transition-transform group-open:rotate-90 dark:text-gray-500"
    >
      <path
        d="M7 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
