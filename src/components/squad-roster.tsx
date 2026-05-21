"use client";

import { useState } from "react";
import type { events } from "@/db/schema";
import { type SquadSignupRow } from "@/lib/roster-utils";
import { displayName } from "@/lib/display";
import { UserAvatar } from "@/components/user-avatar";
import { InfoTip } from "@/components/info-tip";

export type { SquadSignupRow };

const WAITLIST_ROLE = "waitlist";

type EventLike = Pick<
  typeof events.$inferSelect,
  "maxPlayers" | "maxBackups"
>;

// Player-facing squad roster card. Read-only — used on both /event/[id] (the
// home roster + the opposing roster on a scrim) and as the read-only opposing
// roster on /admin/event/[id]. Admin write controls live in
// AdminSignupRow / the admin event page; this component never edits.
export function SquadRoster({
  name,
  subtitle,
  squadNumber,
  rows,
  event,
  currentUserId,
  guildTag,
  defaultOpen = false,
}: {
  name: string;
  // Optional small line under the squad name (e.g. "Squad 1" or "Opponent").
  subtitle?: string;
  squadNumber?: 1 | 2;
  rows: SquadSignupRow[];
  event: EventLike;
  // Highlights "(you)" — pass null when rendering the opposing roster.
  currentUserId: string | null;
  guildTag: string | null;
  defaultOpen?: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const leaders = rows.filter((r) => r.signup.assignedRole === "leader");
  const backups = rows.filter((r) => r.signup.assignedRole === "backup");
  const players = rows.filter(
    (r) =>
      r.signup.assignedRole !== "leader" &&
      r.signup.assignedRole !== "backup" &&
      r.signup.assignedRole !== WAITLIST_ROLE
  );
  const slotCap = event.maxPlayers + event.maxBackups;
  const checkedCount = checked.size;

  const effectiveSubtitle =
    subtitle ?? (squadNumber ? `Squad ${squadNumber}` : undefined);

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-gray-200 bg-white open:shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <Chevron />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{name}</h3>
            {effectiveSubtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{effectiveSubtitle}</p>
            )}
          </div>
        </div>
        <div className="text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
          {checkedCount > 0 ? (
            <span>
              <span className="text-emerald-600 dark:text-emerald-400">{checkedCount}</span>
              <span className="text-gray-400 dark:text-gray-500"> / {rows.length}</span>
            </span>
          ) : (
            <span>{rows.length} / {slotCap}</span>
          )}
        </div>
      </summary>
      <div className="border-t border-gray-100 dark:border-gray-800">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No signups yet.
          </p>
        ) : (
          <>
            <RosterSection
              title="Leaders"
              rows={leaders}
              currentUserId={currentUserId}
              guildTag={guildTag}
              checked={checked}
              onToggle={toggle}
            />
            <RosterSection
              title="Players"
              rows={players}
              currentUserId={currentUserId}
              guildTag={guildTag}
              checked={checked}
              onToggle={toggle}
            />
            <RosterSection
              title="Backups"
              rows={backups}
              currentUserId={currentUserId}
              guildTag={guildTag}
              checked={checked}
              onToggle={toggle}
            />
          </>
        )}
      </div>
    </details>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90 dark:text-gray-500"
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

function RosterSection({
  title,
  rows,
  currentUserId,
  guildTag,
  checked,
  onToggle,
}: {
  title: string;
  rows: SquadSignupRow[];
  currentUserId: string | null;
  guildTag: string | null;
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) =>
    displayName(a.user, guildTag).localeCompare(displayName(b.user, guildTag))
  );
  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
        <span>{title}</span>
        <span className="text-gray-400 dark:text-gray-500">{rows.length}</span>
      </div>
      <ul>
        {sorted.map((row) => (
          <li key={row.signup.id}>
            <SignupListItem
              row={row}
              isCurrentUser={row.user?.id === currentUserId}
              showRoleBadge={false}
              guildTag={guildTag}
              isChecked={checked.has(row.signup.id)}
              onToggle={() => onToggle(row.signup.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SignupListItem({
  row,
  index,
  isCurrentUser,
  showRoleBadge = true,
  guildTag,
  isChecked,
  onToggle,
}: {
  row: SquadSignupRow;
  index?: number;
  isCurrentUser: boolean;
  showRoleBadge?: boolean;
  guildTag: string | null;
  isChecked?: boolean;
  onToggle?: () => void;
}) {
  const { signup, user } = row;
  return (
    <div
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={onToggle ? (e) => (e.key === "Enter" || e.key === " ") && onToggle() : undefined}
      className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${
        onToggle ? "cursor-pointer select-none" : ""
      } ${
        isChecked
          ? "bg-emerald-50/60 dark:bg-emerald-950/20"
          : isCurrentUser
          ? "bg-violet-50/50 dark:bg-violet-950/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
      }`}
    >
      {onToggle && (
        <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isChecked
            ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-500"
            : "border-gray-300 dark:border-gray-600"
        }`}>
          {isChecked && (
            <svg viewBox="0 0 10 8" fill="none" className="size-2.5">
              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}
      {index !== undefined && (
        <span className="w-5 text-right text-xs font-mono text-gray-400 dark:text-gray-500">
          {index}
        </span>
      )}
      <span className={isChecked ? "opacity-50" : undefined}>
        <UserAvatar
          size="size-6"
          name={displayName(user, guildTag)}
          image={user?.image}
        />
      </span>
      <span className={`flex-1 truncate text-sm transition-colors ${
        isChecked
          ? "text-gray-400 line-through dark:text-gray-500"
          : "text-gray-900 dark:text-gray-100"
      }`}>
        {displayName(user, guildTag)}
        {isCurrentUser && !isChecked && (
          <span className="ml-1 text-xs text-violet-600 dark:text-violet-300">(you)</span>
        )}
      </span>
      {showRoleBadge && (
        <RoleBadge
          role={signup.assignedRole}
          requestLeadership={signup.requestLeadership}
        />
      )}
    </div>
  );
}

function RoleBadge({
  role,
  requestLeadership,
}: {
  role: string | null;
  requestLeadership: boolean | null;
}) {
  if (role === "leader") {
    return (
      <InfoTip content="Leads the squad during the match. Assigned by an admin from leadership requests.">
        <Pill className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          Leader
        </Pill>
      </InfoTip>
    );
  }
  if (role === "backup") {
    return (
      <InfoTip content="On the backup roster. Plays only if a starting-roster player drops.">
        <Pill className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">Backup</Pill>
      </InfoTip>
    );
  }
  if (role === "waitlist") {
    return (
      <InfoTip content="All squad and backup slots were full when this player signed up. Promoted to player/backup only if a slot opens.">
        <Pill className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300">
          Waitlist
        </Pill>
      </InfoTip>
    );
  }
  if (role === "player") {
    return (
      <InfoTip content="On the starting roster for the squad.">
        <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          Player
        </Pill>
      </InfoTip>
    );
  }
  if (requestLeadership) {
    return (
      <InfoTip content="This player has requested a leadership role. Admins assign leaders from these requests.">
        <Pill className="border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          Wants Leader
        </Pill>
      </InfoTip>
    );
  }
  return null;
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

export { bucketSquad, sortRoster } from "@/lib/roster-utils";
