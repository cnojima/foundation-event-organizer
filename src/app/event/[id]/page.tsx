import { db } from "@/db";
import { events, guilds, scrimProposals, signups, users } from "@/db/schema";
import { eq, and, asc, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { requireAnyGuildPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getEventStanding, WAITLIST_ROLE } from "@/lib/waitlist";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { DateTime } from "@/components/date-time";
import { scrimSideFor, viewerOutcome } from "@/lib/scrims";
import {
  bucketSquad,
  SignupListItem,
  sortRoster,
  SquadRoster,
  type SquadSignupRow,
} from "@/components/squad-roster";

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

  if (!event || event.deletedAt) return notFound();

  // Members-only: super-admins may view any guild's event; everyone else must
  // be in the event's guild.
  if (!membership.isSuperAdmin && membership.guildId !== event.guildId) {
    redirect("/");
  }

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

  const eventSignups: SignupRow[] = hasRoster
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

      {isScrim && scrim && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50/40 p-4 text-sm">
          <p>
            <span className="font-semibold text-gray-900">Condition of Win:</span>{" "}
            <span className="text-gray-700">{scrim.winCondition}</span>
          </p>
          {scrim.result && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900">Result:</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  scrimOutcome === "W"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : scrimOutcome === "L"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : scrimOutcome === "D"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-gray-200 bg-gray-50 text-gray-600"
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
                <p className="basis-full text-xs italic text-gray-600">
                  &ldquo;{scrim.resultNotes}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {hasRoster && standing && (
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

      {hasRoster && (
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
                <SignupForm
                  event={event}
                  existing={existingSignup}
                  singleSquad={isScrim}
                />
              </div>
            ) : (
              <div className="bg-green-50 rounded-lg p-4">
                <p className="font-medium text-green-800 mb-2">
                  You&apos;re signed up!
                </p>
                <SignupForm
                  event={event}
                  existing={existingSignup}
                  singleSquad={isScrim}
                />
              </div>
            )
          ) : (
            <SignupForm event={event} existing={null} singleSquad={isScrim} />
          )}
        </div>
      )}

      {hasRoster && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold tracking-tight text-gray-900">
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

