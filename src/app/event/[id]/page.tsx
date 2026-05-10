import { db } from "@/db";
import { events, signups, users } from "@/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { requireAnyGuildPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { InfoTip } from "@/components/info-tip";
import { getEventStanding, WAITLIST_ROLE } from "@/lib/waitlist";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";

type SignupRow = {
  signup: typeof signups.$inferSelect;
  user: typeof users.$inferSelect | null;
};

type SquadNumber = 1 | 2;

function bucketSquad(s: SignupRow): SquadNumber | "waitlist" | null {
  if (s.signup.assignedRole === WAITLIST_ROLE) return "waitlist";
  if (s.signup.assignedSquad === 1 || s.signup.assignedSquad === 2) {
    return s.signup.assignedSquad;
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

function sortRoster(rows: SignupRow[]): SignupRow[] {
  return [...rows].sort((a, b) => {
    const ra = roleSortKey(a.signup.assignedRole);
    const rb = roleSortKey(b.signup.assignedRole);
    if (ra !== rb) return ra - rb;
    return a.signup.createdAt.localeCompare(b.signup.createdAt);
  });
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const membership = requireAnyGuildPage(session);

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event || event.deletedAt) return notFound();

  // Members-only: super-admins may view any guild's event; everyone else must
  // be in the event's guild.
  if (!membership.isSuperAdmin && membership.guildId !== event.guildId) {
    redirect("/");
  }

  const isMatch = event.kind === "match";

  const now = new Date().toISOString();
  const isOpen =
    (!event.signupOpens || event.signupOpens <= now) &&
    (!event.signupCloses || event.signupCloses > now);

  const standing = isMatch ? await getEventStanding(event.id) : null;

  const eventSignups: SignupRow[] = isMatch
    ? await db
        .select({ signup: signups, user: users })
        .from(signups)
        .leftJoin(users, eq(signups.userId, users.id))
        .where(and(eq(signups.eventId, event.id), isNull(signups.deletedAt)))
        .orderBy(asc(signups.createdAt))
    : [];

  const squad1 = sortRoster(eventSignups.filter((s) => bucketSquad(s) === 1));
  const squad2 = sortRoster(eventSignups.filter((s) => bucketSquad(s) === 2));
  const waitlist = eventSignups.filter((s) => bucketSquad(s) === "waitlist");

  let existingSignup = null;
  if (isMatch) {
    existingSignup = await db.query.signups.findFirst({
      where: and(
        eq(signups.eventId, event.id),
        eq(signups.userId, membership.userId),
        isNull(signups.deletedAt)
      ),
    });
  }
  const isWaitlisted = existingSignup?.assignedRole === WAITLIST_ROLE;
  const currentUserId = membership.userId;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="mb-2 flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">{event.name}</h1>
        {(event.gameTime || event.squad1StartsAt || event.squad2StartsAt) && (
          <CalendarDownloadLink href={`/api/events/${event.id}/ics`} />
        )}
      </div>
      {event.description && (
        <p className="text-gray-600 mb-4">{event.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        {!isMatch && event.gameTime && (
          <div>
            <span className="font-medium">Start Time:</span>{" "}
            <DateTime iso={event.gameTime} />
          </div>
        )}
        {isMatch && (
          <>
            <div>
              <span className="font-medium">{event.squad1Name}:</span>{" "}
              {event.squad1StartsAt ? (
                <DateTime iso={event.squad1StartsAt} />
              ) : (
                <span className="font-mono text-gray-400">TBD</span>
              )}
            </div>
            <div>
              <span className="font-medium">{event.squad2Name}:</span>{" "}
              {event.squad2StartsAt ? (
                <DateTime iso={event.squad2StartsAt} />
              ) : (
                <span className="font-mono text-gray-400">TBD</span>
              )}
            </div>
          </>
        )}
        {isMatch && event.signupCloses && (
          <div>
            <span className="font-medium">Signup Closes:</span>{" "}
            <DateTime iso={event.signupCloses} />
          </div>
        )}
        {isMatch && (
          <div>
            <span className="font-medium">Slots:</span> {event.maxPlayers} players
            + {event.maxBackups} backups each
          </div>
        )}
      </div>

      {isMatch && standing && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">
              {standing.taken} / {standing.capacity} slots filled
            </span>
            {standing.waitlisted > 0 && (
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                {standing.waitlisted} waitlisted
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full ${standing.isFull ? "bg-amber-500" : "bg-violet-500"}`}
              style={{
                width: `${Math.min(100, (standing.taken / standing.capacity) * 100)}%`,
              }}
            />
          </div>
          {standing.isFull && !isWaitlisted && !existingSignup && (
            <p className="mt-2 text-xs text-amber-700">
              All squad and backup slots are full. New signups will be added to
              the waitlist.
            </p>
          )}
        </div>
      )}

      {isMatch && (
        <div className="mb-6">
          {!isOpen ? (
            <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-600">
              Signups are currently closed for this event.
            </div>
          ) : existingSignup ? (
            isWaitlisted ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 font-semibold text-amber-900">
                  You&apos;re on the waitlist
                </p>
                <p className="mb-3 text-sm text-amber-800">
                  All squad and backup slots are currently full. We&apos;ll let
                  you know if a spot opens up. You can still update your
                  preferences below.
                </p>
                <SignupForm event={event} existing={existingSignup} />
              </div>
            ) : (
              <div className="bg-green-50 rounded-lg p-4">
                <p className="font-medium text-green-800 mb-2">
                  You&apos;re signed up!
                </p>
                <SignupForm event={event} existing={existingSignup} />
              </div>
            )
          ) : (
            <SignupForm event={event} existing={null} />
          )}
        </div>
      )}

      {isMatch && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold tracking-tight text-gray-900">Squads</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <SquadRoster
              name={event.squad1Name}
              squadNumber={1}
              rows={squad1}
              event={event}
              currentUserId={currentUserId}
            />
            <SquadRoster
              name={event.squad2Name}
              squadNumber={2}
              rows={squad2}
              event={event}
              currentUserId={currentUserId}
            />
          </div>
        </section>
      )}

      {isMatch && waitlist.length > 0 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Chevron />
            <h2 className="text-xl font-bold tracking-tight text-gray-900">Waitlist</h2>
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {waitlist.length}
            </span>
          </summary>
          <ol className="mt-3 space-y-1 rounded-lg border border-gray-200 bg-white p-3">
            {waitlist.map((row, i) => (
              <li key={row.signup.id}>
                <SignupListItem
                  index={i + 1}
                  row={row}
                  isCurrentUser={row.user?.id === currentUserId}
                />
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}

function SquadRoster({
  name,
  squadNumber,
  rows,
  event,
  currentUserId,
}: {
  name: string;
  squadNumber: SquadNumber;
  rows: SignupRow[];
  event: typeof events.$inferSelect;
  currentUserId: string | null;
}) {
  const leaders = rows.filter((r) => r.signup.assignedRole === "leader");
  const backups = rows.filter((r) => r.signup.assignedRole === "backup");
  const players = rows.filter(
    (r) =>
      r.signup.assignedRole !== "leader" && r.signup.assignedRole !== "backup"
  );
  const slotCap = event.maxPlayers + event.maxBackups;

  return (
    <details className="group rounded-lg border border-gray-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <Chevron />
          <div>
            <h3 className="font-semibold text-gray-900">{name}</h3>
            <p className="text-xs text-gray-500">Squad {squadNumber}</p>
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
            />
            <RosterSection
              title="Players"
              rows={players}
              currentUserId={currentUserId}
            />
            <RosterSection
              title="Backups"
              rows={backups}
              currentUserId={currentUserId}
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
}: {
  title: string;
  rows: SignupRow[];
  currentUserId: string | null;
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
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignupListItem({
  row,
  index,
  isCurrentUser,
  showRoleBadge = true,
}: {
  row: SignupRow;
  index?: number;
  isCurrentUser: boolean;
  showRoleBadge?: boolean;
}) {
  const { signup, user } = row;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${isCurrentUser ? "bg-violet-50/50" : ""}`}
    >
      {index !== undefined && (
        <span className="w-5 text-right text-xs font-mono text-gray-400">
          {index}
        </span>
      )}
      <UserAvatar size="size-6" name={displayName(user)} />
      <span className="flex-1 truncate text-sm text-gray-900">
        {displayName(user)}
        {isCurrentUser && (
          <span className="ml-1 text-xs text-violet-600">(you)</span>
        )}
      </span>
      {showRoleBadge && (
        <RoleBadge role={signup.assignedRole} requestLeadership={signup.requestLeadership} />
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
        <Pill className="border-amber-200 bg-amber-50 text-amber-700">Leader</Pill>
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
        <Pill className="border-orange-200 bg-orange-50 text-orange-700">Waitlist</Pill>
      </InfoTip>
    );
  }
  if (role === "player") {
    return (
      <InfoTip content="On the starting roster for the squad.">
        <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">Player</Pill>
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
