"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TIER_ORDER, type Tier } from "@/lib/migration-tracker-types";
import type { DuplicateMatch } from "@/lib/migration-dedupe";
import { MigrationQueueRow } from "@/components/migration-tracker/migration-queue-row";
import { DuplicateBadge, duplicateRowId } from "@/components/migration-tracker/migration-duplicate-badge";
import { GameUidCell } from "@/components/migration-tracker/migration-game-uid-cell";

export type AdminQueueRow = {
  id: string;
  playerName: string;
  sourceServer: string;
  power: number;
  tier: Tier;
  desiredGuild: string | null;
  gameUid: string | null;
  contact: string | null;
  createdAt: string;
  status: string;
  duplicates: DuplicateMatch[];
};

const REVIEWABLE_STATUSES = ["applied", "waitlisted", "accepted", "denied"];

function matchesQuery(row: AdminQueueRow, query: string): boolean {
  if (!query) return true;
  return (
    row.playerName.toLowerCase().includes(query) ||
    row.sourceServer.toLowerCase().includes(query) ||
    (row.desiredGuild ?? "").toLowerCase().includes(query) ||
    (row.gameUid ?? "").toLowerCase().includes(query)
  );
}

// Review queue for an open window (bucketed by status per tier, with the
// full set of accept/waitlist/promote/deny/revert/remove actions) or the
// read-only final roster once a window closes — both grouped into
// collapsible-by-tier sections and filterable by name/guild/UID, since
// officers already have UID visible here (unlike the public roster).
export function MigrationAdminQueue({
  rows,
  windowClosed,
  tierLabel,
  isServerAdmin,
}: {
  rows: AdminQueueRow[];
  windowClosed: boolean;
  tierLabel: Record<Tier, string>;
  isServerAdmin: boolean;
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

  const searchBox = (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t("searchPlaceholderAdmin")}
      className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
    />
  );

  if (windowClosed) {
    const relevantRows = rows;
    if (relevantRows.length === 0) {
      return <p className="text-gray-500 dark:text-gray-400">{t("emptyRoster")}</p>;
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
    const totalMatches = matched.length;

    return (
      <div>
        {searchBox}
        {TIER_ORDER.map((tier) => {
          const tierRows = relevantRows.filter((r) => r.tier === tier);
          if (tierRows.length === 0) return null;
          const tierMatches = matched
            .filter((r) => r.tier === tier)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (searching && tierMatches.length === 0) return null;
          const open = searching ? true : !manuallyClosed.has(tier);

          return (
            <details
              key={tier}
              open={open}
              onToggle={(e) => toggleTier(tier, e.currentTarget.open)}
              className="group mb-6"
            >
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 [&::-webkit-details-marker]:hidden dark:text-gray-400">
                <Chevron />
                {tierLabel[tier] ?? tier}
                <span className="text-xs font-normal normal-case text-gray-400 dark:text-gray-500">
                  {searching ? t("matchCount", { count: tierMatches.length, total: tierRows.length }) : tierRows.length}
                </span>
              </summary>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colDesiredGuild")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colGameUid")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colStatus")}</th>
                      <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierMatches.map((a) => (
                      <tr
                        key={a.id}
                        id={duplicateRowId(a.id)}
                        className="scroll-mt-4 border-t border-gray-100 target:bg-amber-50 dark:border-gray-800 dark:target:bg-amber-950/30"
                      >
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                          {a.playerName}
                          <DuplicateBadge matches={a.duplicates} label={t("duplicateBadge")} />
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.sourceServer}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.power.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.desiredGuild ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                          <GameUidCell gameUid={a.gameUid} missingLabel={t("missingGameUid")} />
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
            </details>
          );
        })}
        {searching && totalMatches === 0 && (
          <p className="text-gray-500 dark:text-gray-400">{t("noSearchResults")}</p>
        )}
      </div>
    );
  }

  const reviewable = rows.filter((r) => REVIEWABLE_STATUSES.includes(r.status));
  if (reviewable.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">{t("empty")}</p>;
  }
  const matched = reviewable.filter((r) => matchesQuery(r, normalizedQuery));
  const applied = matched.filter((r) => r.status === "applied");
  const waitlisted = matched.filter((r) => r.status === "waitlisted");
  const accepted = matched.filter((r) => r.status === "accepted");
  const denied = matched.filter((r) => r.status === "denied");

  return (
    <div>
      {searchBox}
      {TIER_ORDER.map((tier) => {
        const tierRows = reviewable.filter((r) => r.tier === tier);
        if (tierRows.length === 0) return null;

        const appliedForTier = applied.filter((a) => a.tier === tier);
        const waitlistedForTier = waitlisted.filter((a) => a.tier === tier);
        const acceptedForTier = accepted.filter((a) => a.tier === tier);
        const deniedForTier = denied.filter((a) => a.tier === tier);
        const tierMatchCount =
          appliedForTier.length + waitlistedForTier.length + acceptedForTier.length + deniedForTier.length;
        if (searching && tierMatchCount === 0) return null;
        const open = searching ? true : !manuallyClosed.has(tier);

        return (
          <details
            key={tier}
            open={open}
            onToggle={(e) => toggleTier(tier, e.currentTarget.open)}
            className="group mb-6"
          >
            <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 [&::-webkit-details-marker]:hidden dark:text-gray-400">
              <Chevron />
              {tierLabel[tier] ?? tier}
              <span className="text-xs font-normal normal-case text-gray-400 dark:text-gray-500">
                {searching ? t("matchCount", { count: tierMatchCount, total: tierRows.length }) : tierRows.length}
              </span>
            </summary>
            <div className="mt-2">
              {appliedForTier.length > 0 && (
                <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                        <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                        <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appliedForTier.map((a) => (
                        <MigrationQueueRow
                          key={a.id}
                          application={{
                            id: a.id,
                            playerName: a.playerName,
                            sourceServer: a.sourceServer,
                            power: a.power,
                            desiredGuild: a.desiredGuild,
                            gameUid: a.gameUid,
                            contact: a.contact,
                            createdAt: a.createdAt,
                          }}
                          status="applied"
                          showRemove={isServerAdmin}
                          duplicates={a.duplicates}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {waitlistedForTier.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    {t("waitlistHeading")}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50 text-left text-xs uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {waitlistedForTier.map((a) => (
                          <MigrationQueueRow
                            key={a.id}
                            application={{
                              id: a.id,
                              playerName: a.playerName,
                              sourceServer: a.sourceServer,
                              power: a.power,
                              contact: a.contact,
                              gameUid: a.gameUid,
                              desiredGuild: a.desiredGuild,
                              createdAt: a.createdAt,
                            }}
                            status="waitlisted"
                            showRemove={isServerAdmin}
                            duplicates={a.duplicates}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {acceptedForTier.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                    {t("acceptedHeading")}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-violet-200 bg-violet-50/40 dark:border-violet-900/60 dark:bg-violet-950/20">
                    <table className="w-full text-sm">
                      <thead className="bg-violet-50 text-left text-xs uppercase tracking-wider text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptedForTier.map((a) => (
                          <MigrationQueueRow
                            key={a.id}
                            application={{
                              id: a.id,
                              playerName: a.playerName,
                              sourceServer: a.sourceServer,
                              power: a.power,
                              contact: a.contact,
                              gameUid: a.gameUid,
                              desiredGuild: a.desiredGuild,
                              createdAt: a.createdAt,
                            }}
                            status="accepted"
                            showRemove={isServerAdmin}
                            duplicates={a.duplicates}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {deniedForTier.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                    {t("deniedHeading")}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 text-left text-xs uppercase tracking-wider text-red-800 dark:bg-red-950/40 dark:text-red-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">{t("colPlayer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colSourceServer")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colPower")}</th>
                          <th className="px-3 py-2 font-semibold">{t("colApplied")}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t("colActions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deniedForTier.map((a) => (
                          <MigrationQueueRow
                            key={a.id}
                            application={{
                              id: a.id,
                              playerName: a.playerName,
                              sourceServer: a.sourceServer,
                              power: a.power,
                              contact: a.contact,
                              gameUid: a.gameUid,
                              desiredGuild: a.desiredGuild,
                              createdAt: a.createdAt,
                            }}
                            status="denied"
                            showRemove={isServerAdmin}
                            duplicates={a.duplicates}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
