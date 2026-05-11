import type { events, signups, users } from "@/db/schema";
import { WAITLIST_ROLE } from "@/lib/waitlist";
import { displayName } from "@/lib/display";
import { UserAvatar } from "@/components/user-avatar";
import { InfoTip } from "@/components/info-tip";

export type SquadSignupRow = {
  signup: typeof signups.$inferSelect;
  user: typeof users.$inferSelect | null;
};

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
  const leaders = rows.filter((r) => r.signup.assignedRole === "leader");
  const backups = rows.filter((r) => r.signup.assignedRole === "backup");
  const players = rows.filter(
    (r) =>
      r.signup.assignedRole !== "leader" &&
      r.signup.assignedRole !== "backup" &&
      r.signup.assignedRole !== WAITLIST_ROLE
  );
  const slotCap = event.maxPlayers + event.maxBackups;

  const effectiveSubtitle =
    subtitle ?? (squadNumber ? `Squad ${squadNumber}` : undefined);

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-gray-200 bg-white open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <Chevron />
          <div>
            <h3 className="font-semibold text-gray-900">{name}</h3>
            {effectiveSubtitle && (
              <p className="text-xs text-gray-500">{effectiveSubtitle}</p>
            )}
          </div>
        </div>
        <div className="text-right text-xs font-semibold text-gray-700">
          {rows.length} / {slotCap}
        </div>
      </summary>
      <div className="border-t border-gray-100">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            No signups yet.
          </p>
        ) : (
          <>
            <RosterSection
              title="Leaders"
              rows={leaders}
              currentUserId={currentUserId}
              guildTag={guildTag}
            />
            <RosterSection
              title="Players"
              rows={players}
              currentUserId={currentUserId}
              guildTag={guildTag}
            />
            <RosterSection
              title="Backups"
              rows={backups}
              currentUserId={currentUserId}
              guildTag={guildTag}
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
      className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90"
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
}: {
  title: string;
  rows: SquadSignupRow[];
  currentUserId: string | null;
  guildTag: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
        <span>{title}</span>
        <span className="text-gray-400">{rows.length}</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.signup.id}>
            <SignupListItem
              row={row}
              isCurrentUser={row.user?.id === currentUserId}
              showRoleBadge={false}
              guildTag={guildTag}
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
}: {
  row: SquadSignupRow;
  index?: number;
  isCurrentUser: boolean;
  showRoleBadge?: boolean;
  guildTag: string | null;
}) {
  const { signup, user } = row;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${
        isCurrentUser ? "bg-violet-50/50" : ""
      }`}
    >
      {index !== undefined && (
        <span className="w-5 text-right text-xs font-mono text-gray-400">
          {index}
        </span>
      )}
      <UserAvatar
        size="size-6"
        name={displayName(user, guildTag)}
        image={user?.image}
      />
      <span className="flex-1 truncate text-sm text-gray-900">
        {displayName(user, guildTag)}
        {isCurrentUser && (
          <span className="ml-1 text-xs text-violet-600">(you)</span>
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
        <Pill className="border-amber-200 bg-amber-50 text-amber-700">
          Leader
        </Pill>
      </InfoTip>
    );
  }
  if (role === "backup") {
    return (
      <InfoTip content="On the backup roster. Plays only if a starting-roster player drops.">
        <Pill className="border-sky-200 bg-sky-50 text-sky-700">Backup</Pill>
      </InfoTip>
    );
  }
  if (role === "waitlist") {
    return (
      <InfoTip content="All squad and backup slots were full when this player signed up. Promoted to player/backup only if a slot opens.">
        <Pill className="border-orange-200 bg-orange-50 text-orange-700">
          Waitlist
        </Pill>
      </InfoTip>
    );
  }
  if (role === "player") {
    return (
      <InfoTip content="On the starting roster for the squad.">
        <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
          Player
        </Pill>
      </InfoTip>
    );
  }
  if (requestLeadership) {
    return (
      <InfoTip content="This player has requested a leadership role. Admins assign leaders from these requests.">
        <Pill className="border-amber-200 bg-amber-50/60 text-amber-700">
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

// Helpers exported so other pages can group signups consistently — e.g. when
// computing which squad bucket a row belongs to before passing rows into
// <SquadRoster>.
export function bucketSquad(s: SquadSignupRow): 1 | 2 | "waitlist" | null {
  if (s.signup.assignedRole === WAITLIST_ROLE) return "waitlist";
  if (s.signup.assignedSquad === 1 || s.signup.assignedSquad === 2) {
    return s.signup.assignedSquad as 1 | 2;
  }
  if (s.signup.squad1Preference === 1) return 1;
  if (s.signup.squad2Preference === 1) return 2;
  return null;
}

function roleSortKey(role: string | null): number {
  if (role === "leader") return 0;
  if (role === "backup") return 2;
  return 1;
}

export function sortRoster(rows: SquadSignupRow[]): SquadSignupRow[] {
  return [...rows].sort((a, b) => {
    const ra = roleSortKey(a.signup.assignedRole);
    const rb = roleSortKey(b.signup.assignedRole);
    if (ra !== rb) return ra - rb;
    return a.signup.createdAt.localeCompare(b.signup.createdAt);
  });
}
