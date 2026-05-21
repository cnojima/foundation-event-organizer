import { db } from "@/db";
import { events, guilds, scrimProposals, signups, users } from "@/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { AddWalkInsButton } from "@/components/attendance-section";
import { type EligibleMember } from "@/components/admin-signup-on-behalf-form";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireAnyGuildPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getEventStanding, WAITLIST_ROLE } from "@/lib/waitlist";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { DateTime } from "@/components/date-time";
import { EventKindHero } from "@/components/event-kind-icon";
import { scrimSideFor, viewerOutcome } from "@/lib/scrims";
import { SignupListItem, SquadRoster } from "@/components/squad-roster";
import { bucketSquad, sortRoster, type SquadSignupRow } from "@/lib/roster-utils";

type SignupRow = SquadSignupRow;

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

  if (!event) return notFound();

  // Admin-of-this-event check used by both the deleted-event guard below
  // and the "Edit event" CTA further down. Super-admins are implicitly
  // admin everywhere.
  const isAdminForThisEvent =
    membership.isSuperAdmin ||
    (membership.guildRole === "admin" && membership.guildId === event.guildId);

  // Soft-deleted events are visible to admins of that guild (so they can
  // pull up attendance history from the Deleted tab on /) but 404 for
  // everyone else.
  if (event.deletedAt && !isAdminForThisEvent) return notFound();

  // Members-only: super-admins may view any guild's event; everyone else must
  // be in the event's guild.
  if (!membership.isSuperAdmin && membership.guildId !== event.guildId) {
    redirect("/");
  }

  const isDeleted = !!event.deletedAt;

  const eventGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, event.guildId),
    columns: { tag: true },
  });
  const guildTag = eventGuild?.tag ?? null;

  const isMatch = event.kind === "match";
  const isScrim = event.kind === "scrim";
  const hasRoster = isMatch || isScrim;

  // Scrim metadata: opponent guild name + result chip.
  const scrim =
    isScrim && event.scrimmageId
      ? await db.query.scrimProposals.findFirst({
          where: eq(scrimProposals.id, event.scrimmageId),
        })
      : null;
  const opposingGuild =
    isScrim && event.opposingGuildId
      ? await db.query.guilds.findFirst({
          where: eq(guilds.id, event.opposingGuildId),
        })
      : null;
  const scrimSide = scrim
    ? scrimSideFor(event.guildId, scrim.proposingGuildId, scrim.opposingGuildId)
    : null;
  const scrimOutcome = scrim ? viewerOutcome(scrimSide!, scrim.result) : null;

  const now = new Date().toISOString();
  const isOpen =
    (!event.signupOpens || event.signupOpens <= now) &&
    (!event.signupCloses || event.signupCloses > now);

  const standing = hasRoster ? await getEventStanding(event.id) : null;

  // Always load — match/scrim feed the squad rosters + waitlist below;
  // simple events use it for the attendee list. Cheap join either way.
  const eventSignups: SignupRow[] = await db
    .select({ signup: signups, user: users })
    .from(signups)
    .leftJoin(users, eq(signups.userId, users.id))
    .where(and(eq(signups.eventId, event.id), isNull(signups.deletedAt)))
    .orderBy(asc(signups.createdAt));

  const squad1 = sortRoster(eventSignups.filter((s) => bucketSquad(s) === 1));
  const squad2 = sortRoster(eventSignups.filter((s) => bucketSquad(s) === 2));
  const waitlist = eventSignups.filter((s) => bucketSquad(s) === "waitlist");
  // Attendees = anyone marked attended (signup-bound players + ad-hoc
  // walk-ins). Ordered by signup createdAt (insertion order) — stable.
  const attendees = eventSignups.filter((s) => s.signup.attended);

  // Scrim — pull the opposing guild's mirrored event + roster so both
  // sides' lineups render on the same page. Admin internals (attended,
  // rating, notes) stay private to each guild; only the public roster shape
  // is shared.
  const opposingEventId = scrim
    ? event.guildId === scrim.proposingGuildId
      ? scrim.opposingEventId
      : scrim.proposingEventId
    : null;
  const opposingEvent =
    opposingEventId
      ? await db.query.events.findFirst({
          where: eq(events.id, opposingEventId),
        })
      : null;
  const opposingSignups: SignupRow[] = opposingEventId
    ? await db
        .select({ signup: signups, user: users })
        .from(signups)
        .leftJoin(users, eq(signups.userId, users.id))
        .where(
          and(eq(signups.eventId, opposingEventId), isNull(signups.deletedAt))
        )
        .orderBy(asc(signups.createdAt))
    : [];
  const opposingRoster = sortRoster(
    opposingSignups.filter((s) => bucketSquad(s) === 1)
  );

  let existingSignup = null;
  if (hasRoster) {
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

  // Admin links from the player view:
  //   - "Edit event" → the dedicated edit form for fields (name, dates, etc).
  //   - "Manage event" → the full roster/attendance dashboard, which is
  //     where walk-in attendance and squad management live.
  // The impersonation hint (?guildId=) is preserved when a super-admin
  // acts on a foreign guild so /admin pages can pin the correct context.
  const impersonatingSuffix =
    membership.isSuperAdmin && event.guildId !== membership.guildId
      ? `?guildId=${event.guildId}`
      : "";
  const adminEditHref = `/admin/event/${event.id}/edit${impersonatingSuffix}`;
  const adminManageHref = `/admin/event/${event.id}${impersonatingSuffix}`;
  const tAdmin = await getTranslations("admin");

  // Admins can mark walk-ins directly from this page. Load the picker's
  // eligible-member list — guild members not already in an active row.
  // Cheaper than the manage page version since we only need id+display.
  const signedUpUserIds = new Set(eventSignups.map((s) => s.signup.userId));
  const eligibleMembers: EligibleMember[] =
    isAdminForThisEvent && !isDeleted
      ? (
          await db
            .select()
            .from(users)
            .where(eq(users.guildId, event.guildId))
            .orderBy(users.inGameName, users.name)
        )
          .filter((u) => !signedUpUserIds.has(u.id))
          .map((u) => ({
            id: u.id,
            display: displayName(u, guildTag),
            isStub: !!u.stubCreatedAt,
          }))
      : [];

  return (
    <main className="max-w-5xl mx-auto p-6">
      {isDeleted && event.deletedAt && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          This event was deleted on{" "}
          <DateTime iso={event.deletedAt} />. Signup data is retained for
          attendance reports.
        </div>
      )}

      {/* Overview card — CTA row, then title row, then description + metadata.
          Card chrome matches the listing cards on / so the detail view reads
          like a "zoomed-in" version of the listing. */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        {/* CTA row — sits at the top, aligned right, on its own line so the
            title underneath gets its own breathing room. */}
        {(isAdminForThisEvent ||
          (!isDeleted &&
            (event.gameTime || event.squad1StartsAt || event.squad2StartsAt))) && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            {!isDeleted &&
              (event.gameTime || event.squad1StartsAt || event.squad2StartsAt) && (
                <CalendarDownloadLink href={`/api/events/${event.id}/ics`} />
              )}
            {isAdminForThisEvent && !isDeleted && (
              <Link
                href={adminManageHref}
                className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
              >
                Manage event
              </Link>
            )}
            {isAdminForThisEvent && (
              <Link
                href={adminEditHref}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                {tAdmin("editEvent")}
              </Link>
            )}
          </div>
        )}
        <div className="mb-2 flex items-center gap-3">
          <EventKindHero kind={event.kind} size="lg" />
          <h1 className={`text-3xl font-bold ${isDeleted ? "line-through" : ""}`}>
            {event.name}
          </h1>
          {isDeleted && (
            <span className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Deleted
            </span>
          )}
        </div>
        {event.description && (
          <p className="text-gray-600 mb-4 dark:text-gray-400">{event.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          {!isMatch && !isScrim && event.gameTime && (
            <div>
              <span className="font-medium">Start Time:</span>{" "}
              <DateTime iso={event.gameTime} />
            </div>
          )}
          {isScrim && (
            <>
              {event.gameTime && (
                <div>
                  <span className="font-medium">Start Time:</span>{" "}
                  <DateTime iso={event.gameTime} />
                </div>
              )}
              {opposingGuild && (
                <div>
                  <span className="font-medium">Opponent:</span>{" "}
                  {opposingGuild.tag
                    ? `[${opposingGuild.tag}] ${opposingGuild.name}`
                    : opposingGuild.name}
                </div>
              )}
              {scrim && (
                <div>
                  <span className="font-medium">Location:</span> {scrim.location}
                </div>
              )}
              <div>
                <span className="font-medium">Slots:</span> {event.maxPlayers}{" "}
                players + {event.maxBackups} backups
              </div>
            </>
          )}
          {isMatch && (
            <>
              <div>
                <span className="font-medium">{event.squad1Name}:</span>{" "}
                {event.squad1StartsAt ? (
                  <DateTime iso={event.squad1StartsAt} />
                ) : (
                  <span className="font-mono text-gray-400 dark:text-gray-500">TBD</span>
                )}
              </div>
              <div>
                <span className="font-medium">{event.squad2Name}:</span>{" "}
                {event.squad2StartsAt ? (
                  <DateTime iso={event.squad2StartsAt} />
                ) : (
                  <span className="font-mono text-gray-400 dark:text-gray-500">TBD</span>
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
      </div>

      {/* Attendees — anyone with `attended = true` (signup-bound players +
          ad-hoc walk-ins). Always renders so the count is visible even
          when zero. Admins also get the "+ Add walk-ins" picker inline. */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Attendees
            </h2>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              {attendees.length}
            </span>
          </div>
          {isAdminForThisEvent && !isDeleted && (
            <AddWalkInsButton eventId={event.id} members={eligibleMembers} />
          )}
        </div>
        {attendees.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No one marked attended yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attendees.map((a) => {
              const name = displayName(a.user, guildTag);
              // a.user can be null if the underlying user row was hard-
              // deleted (rare — signups normally cascade or soft-delete).
              // Fall back to a plain pill in that case.
              const userId = a.user?.id;
              const pillClass =
                "flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm dark:border-gray-800 dark:bg-gray-800";
              const inner = (
                <>
                  <UserAvatar size="size-6" name={name} image={a.user?.image} />
                  <span className="text-gray-900 dark:text-gray-100">{name}</span>
                </>
              );
              return userId ? (
                <Link
                  key={a.signup.id}
                  href={`/players/${userId}`}
                  className={`${pillClass} transition-colors hover:border-violet-400 hover:bg-violet-50 dark:hover:border-violet-700 dark:hover:bg-violet-950/40`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={a.signup.id} className={pillClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isScrim && scrim && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50/40 p-4 text-sm dark:border-rose-900/60 dark:bg-rose-950/20">
          <p>
            <span className="font-semibold text-gray-900 dark:text-gray-100">Condition of Win:</span>{" "}
            <span className="text-gray-700 dark:text-gray-300">{scrim.winCondition}</span>
          </p>
          {scrim.result && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100">Result:</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  scrimOutcome === "W"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : scrimOutcome === "L"
                      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                      : scrimOutcome === "D"
                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                        : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
                }`}
              >
                {scrimOutcome === "W"
                  ? "Won"
                  : scrimOutcome === "L"
                    ? "Lost"
                    : scrimOutcome === "D"
                      ? "Draw"
                      : "No contest"}
              </span>
              {scrim.resultNotes && (
                <p className="basis-full text-xs italic text-gray-600 dark:text-gray-400">
                  &ldquo;{scrim.resultNotes}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hasRoster && standing && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {standing.taken} / {standing.capacity} slots filled
            </span>
            {standing.waitlisted > 0 && (
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {standing.waitlisted} waitlisted
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className={`h-full ${standing.isFull ? "bg-amber-500" : "bg-violet-500"}`}
              style={{
                width: `${Math.min(100, (standing.taken / standing.capacity) * 100)}%`,
              }}
            />
          </div>
          {standing.isFull && !isWaitlisted && !existingSignup && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              All squad and backup slots are full. New signups will be added to
              the waitlist.
            </p>
          )}
        </div>
      )}

      {hasRoster && !isDeleted && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          {!isOpen ? (
            <p className="text-center text-gray-600 dark:text-gray-400">
              Signups are currently closed for this event.
            </p>
          ) : existingSignup ? (
            <>
              {isWaitlisted ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                  <p className="mb-1 font-semibold text-amber-900 dark:text-amber-200">
                    You&apos;re on the waitlist
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    All squad and backup slots are currently full. We&apos;ll
                    let you know if a spot opens up. You can still update your
                    preferences below.
                  </p>
                </div>
              ) : (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                    You&apos;re signed up!
                  </p>
                </div>
              )}
              <SignupForm
                event={event}
                existing={existingSignup}
                singleSquad={isScrim}
              />
            </>
          ) : (
            <SignupForm event={event} existing={null} singleSquad={isScrim} />
          )}
        </div>
      )}

      {hasRoster && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {isScrim ? "Rosters" : "Squads"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <SquadRoster
              name={event.squad1Name}
              subtitle={isScrim ? "Your guild" : `Squad 1`}
              squadNumber={isScrim ? undefined : 1}
              rows={squad1}
              event={event}
              currentUserId={currentUserId}
              guildTag={guildTag}
              defaultOpen={isScrim}
            />
            {isScrim && opposingGuild && opposingEvent && (
              <SquadRoster
                name={
                  opposingGuild.tag
                    ? `[${opposingGuild.tag}] ${opposingGuild.name}`
                    : opposingGuild.name
                }
                subtitle="Opponent"
                rows={opposingRoster}
                event={opposingEvent}
                currentUserId={null}
                guildTag={opposingGuild.tag}
                defaultOpen
              />
            )}
            {!isScrim && (
              <SquadRoster
                name={event.squad2Name}
                squadNumber={2}
                rows={squad2}
                event={event}
                currentUserId={currentUserId}
                guildTag={guildTag}
              />
            )}
          </div>
        </section>
      )}

      {hasRoster && waitlist.length > 0 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
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
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Waitlist</h2>
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              {waitlist.length}
            </span>
          </summary>
          <ol className="mt-3 space-y-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            {waitlist.map((row, i) => (
              <li key={row.signup.id}>
                <SignupListItem
                  index={i + 1}
                  row={row}
                  isCurrentUser={row.user?.id === currentUserId}
                  guildTag={guildTag}
                />
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}

