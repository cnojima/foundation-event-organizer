"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { events, signups, users } from "@/db/schema";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { InfoTip } from "@/components/info-tip";

type SignupWithEvent = {
  signup: typeof signups.$inferSelect;
  event: typeof events.$inferSelect | null;
};

export type PlayerKindRow = {
  user: typeof users.$inferSelect;
  signups: SignupWithEvent[];
};

function preferenceLabel(pref: number | null): string {
  if (pref === 1) return "1st";
  if (pref === 2) return "2nd";
  return "—";
}

function PreferencePill({ label, pref }: { label: string; pref: number | null }) {
  const has = pref === 1 || pref === 2;
  const tooltip =
    pref === 1
      ? `${label} is the player's first choice.`
      : pref === 2
        ? `${label} is the player's second choice.`
        : `Player has no preference for ${label}.`;
  return (
    <InfoTip content={tooltip}>
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
          has
            ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"
            : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
        }`}
      >
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <span>{preferenceLabel(pref)}</span>
      </span>
    </InfoTip>
  );
}

const ROLE_TOOLTIPS: Record<string, string> = {
  leader: "Assigned to lead the squad during the match.",
  player: "On the starting roster for the squad.",
  backup: "On the backup roster — plays only if a starter drops.",
  waitlist: "All slots were full at signup. Promoted only if a slot opens.",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const styles: Record<string, string> = {
    leader: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
    player: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
    backup: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60",
    waitlist: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60",
  };
  return (
    <InfoTip content={ROLE_TOOLTIPS[role] ?? `Assigned role: ${role}`}>
      <span
        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${
          styles[role] ?? "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800"
        }`}
      >
        {role}
      </span>
    </InfoTip>
  );
}

function eventTimeIso(signup: typeof signups.$inferSelect, event: typeof events.$inferSelect): string | null {
  const assigned =
    signup.assignedSquad === 1
      ? event.squad1StartsAt
      : signup.assignedSquad === 2
        ? event.squad2StartsAt
        : null;
  const firstChoice =
    signup.squad1Preference === 1
      ? event.squad1StartsAt
      : signup.squad2Preference === 1
        ? event.squad2StartsAt
        : null;
  const fallback = event.kind === "simple" ? event.gameTime : event.squad1StartsAt ?? event.squad2StartsAt;
  return assigned ?? firstChoice ?? fallback;
}

function PlayerSignupDetail({ signup, event, linkSuffix }: SignupWithEvent & { linkSuffix: string }) {
  const iso = event ? eventTimeIso(signup, event) : null;
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {event ? (
            <Link
              href={`/admin/event/${event.id}${linkSuffix}`}
              className="text-sm font-semibold text-gray-900 hover:text-violet-700 dark:text-gray-100 dark:hover:text-violet-300"
            >
              {event.name}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-gray-400 italic dark:text-gray-500">Deleted event</span>
          )}
          {iso && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <DateTime iso={iso} showUTC={false} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {event && event.kind !== "simple" && (
            <>
              <PreferencePill label={event.squad1Name ?? "Squad 1"} pref={signup.squad1Preference} />
              <PreferencePill label={event.squad2Name ?? "Squad 2"} pref={signup.squad2Preference} />
            </>
          )}
          {signup.willingBackup && (
            <InfoTip content="Player accepted being a backup if the main roster fills up.">
              <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
                Backup OK
              </span>
            </InfoTip>
          )}
          {signup.requestLeadership && (
            <InfoTip content="Player asked to be considered for a leader spot.">
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                Leadership
              </span>
            </InfoTip>
          )}
          {signup.assignedSquad && (
            <InfoTip content={`Admin manually assigned this player to Squad ${signup.assignedSquad}.`}>
              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                Assigned: Squad {signup.assignedSquad}
              </span>
            </InfoTip>
          )}
          <RoleBadge role={signup.assignedRole} />
          {signup.attended === true && (
            <InfoTip content="Admin marked this player as showing up for the match.">
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Attended
              </span>
            </InfoTip>
          )}
          {signup.attended === false && (
            <InfoTip content="Admin marked this player as a no-show.">
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                No-show
              </span>
            </InfoTip>
          )}
          {signup.rating != null && (
            <InfoTip content={`Admin rating: ${signup.rating} of 5.`}>
              <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                ★ {signup.rating}
              </span>
            </InfoTip>
          )}
        </div>
      </div>
      {signup.leadershipNote && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-semibold">Leadership note: </span>
          {signup.leadershipNote}
        </div>
      )}
    </li>
  );
}

export function PlayerKindSection({
  title,
  rows,
  guildIdQuery,
  guildTag,
}: {
  title: string;
  rows: PlayerKindRow[];
  guildIdQuery?: string;
  guildTag: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const linkSuffix = guildIdQuery ? `?guildId=${guildIdQuery}` : "";

  if (rows.length === 0) return null;

  function toggle(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="px-5 py-2">Player</th>
              <th className="px-5 py-2 text-right">Signups</th>
              <th className="px-5 py-2 text-right">Attended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map(({ user, signups: userSignups }) => {
              const attendedCount = userSignups.filter((r) => r.signup.attended === true).length;
              const isOpen = expanded.has(user.id);
              return (
                <Fragment key={user.id}>
                  <tr
                    onClick={() => toggle(user.id)}
                    className="cursor-pointer bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-gray-400 transition-transform dark:text-gray-500 ${isOpen ? "rotate-90" : ""}`}
                        >
                          ▶
                        </span>
                        <UserAvatar name={displayName(user, guildTag)} image={user.image} size="size-8" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {displayName(user, guildTag)}
                        </span>
                        {user.guildRole === "admin" && (
                          <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {userSignups.length}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {attendedCount}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={3} className="bg-gray-50/60 p-0 dark:bg-gray-950/40">
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                          {userSignups.map(({ signup, event }) => (
                            <PlayerSignupDetail key={signup.id} signup={signup} event={event} linkSuffix={linkSuffix} />
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
