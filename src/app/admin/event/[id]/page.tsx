import { db } from "@/db";
import { events, scrimProposals, signups, users, guilds } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import { AdminSignupRow } from "@/components/admin-signup-row";
import { computeStanding, WAITLIST_ROLE } from "@/lib/waitlist";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { DeleteEventButton } from "@/components/delete-event-button";
import { EditEventDatesButton, EditEventDatesForm } from "@/components/edit-event-dates-form";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { ScrimResultForm } from "@/components/scrim-result-form";
import { scrimSideFor, viewerOutcome } from "@/lib/scrims";
import { SquadRoster, sortRoster, bucketSquad } from "@/components/squad-roster";

export default async function AdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);

  const { id } = await params;
  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
  });

  if (!event) return notFound();

  // Authorization: guild admin of event's guild, or super-admin.
  if (
    !membership.isSuperAdmin &&
    !(membership.guildRole === "admin" && membership.guildId === event.guildId)
  ) {
    redirect("/");
  }

  const isImpersonating =
    membership.isSuperAdmin && event.guildId !== membership.guildId;
  const eventGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, event.guildId),
  });
  const actingGuild = isImpersonating ? eventGuild : null;
  const guildTag = eventGuild?.tag ?? null;

  const isMatch = event.kind === "match";
  const isScrim = event.kind === "scrim";
  const hasRoster = isMatch || isScrim;

  // Scrims load their proposal (for opponent name + result state) and reuse
  // the match signup tables — but only the squad1 column is populated.
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

  const eventSignups = hasRoster
    ? await db
        .select({ signup: signups, user: users })
        .from(signups)
        .leftJoin(users, eq(signups.userId, users.id))
        .where(and(eq(signups.eventId, id), isNull(signups.deletedAt)))
    : [];

  // Scrim — load the opposing guild's mirrored event + roster so the admin
  // sees both lineups side by side. Opposing roster is rendered read-only
  // (no AdminSignupRow controls); admin internals stay private to each guild.
  const opposingEventId = scrim
    ? event.guildId === scrim.proposingGuildId
      ? scrim.opposingEventId
      : scrim.proposingEventId
    : null;
  const opposingEvent = opposingEventId
    ? await db.query.events.findFirst({
        where: eq(events.id, opposingEventId),
      })
    : null;
  const opposingSignups = opposingEventId
    ? await db
        .select({ signup: signups, user: users })
        .from(signups)
        .leftJoin(users, eq(signups.userId, users.id))
        .where(
          and(eq(signups.eventId, opposingEventId), isNull(signups.deletedAt))
        )
    : [];
  const opposingRoster = sortRoster(
    opposingSignups.filter((s) => bucketSquad(s) === 1)
  );

  // Effective squad placement: admin's explicit assignment wins; fall back
  // to first-choice preference. This way "Move to Bravo" actually relocates
  // the player in the UI on the next render.
  function effectiveSquad(s: typeof eventSignups[number]["signup"]): 1 | 2 | null {
    if (s.assignedSquad === 1 || s.assignedSquad === 2) {
      return s.assignedSquad as 1 | 2;
    }
    if (s.squad1Preference === 1) return 1;
    if (s.squad2Preference === 1) return 2;
    return null;
  }
  const squad1Signups = eventSignups.filter(
    (s) =>
      s.signup.assignedRole !== WAITLIST_ROLE && effectiveSquad(s.signup) === 1
  );
  const squad2Signups = eventSignups.filter(
    (s) =>
      s.signup.assignedRole !== WAITLIST_ROLE && effectiveSquad(s.signup) === 2
  );
  const leadershipRequests = eventSignups.filter(
    (s) => s.signup.requestLeadership
  );
  const waitlistSignups = eventSignups
    .filter((s) => s.signup.assignedRole === WAITLIST_ROLE)
    .sort((a, b) => a.signup.createdAt.localeCompare(b.signup.createdAt));
  const standing = computeStanding(
    event,
    eventSignups.map((s) => ({ assignedRole: s.signup.assignedRole }))
  );

  return (
    <main className="max-w-6xl mx-auto p-6">
      {actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{event.name}</h1>
          {event.deletedAt && (
            <span className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Deleted
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!event.deletedAt && !isScrim && <EditEventDatesButton />}
          {(event.gameTime || event.squad1StartsAt || event.squad2StartsAt) && (
            <CalendarDownloadLink href={`/api/events/${event.id}/ics`} />
          )}
          {!event.deletedAt && (
            <DeleteEventButton
              eventId={event.id}
              eventName={event.name}
              signupCount={eventSignups.length}
            />
          )}
        </div>
      </div>
      {event.deletedAt && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          This event was deleted on{" "}
          <DateTime iso={event.deletedAt} />. Signup data is retained for
          attendance reports.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400">
        {(isScrim || !isMatch) && event.gameTime && !isScrim && (
          <span>
            Starts: <DateTime iso={event.gameTime} />
          </span>
        )}
        {isScrim && (
          <>
            <span>
              {event.gameTime ? (
                <DateTime iso={event.gameTime} />
              ) : (
                <span className="font-mono text-gray-400 dark:text-gray-500">TBD</span>
              )}
            </span>
            {opposingGuild && (
              <span>
                vs{" "}
                <strong className="text-gray-800 dark:text-gray-200">
                  {opposingGuild.tag
                    ? `[${opposingGuild.tag}] ${opposingGuild.name}`
                    : opposingGuild.name}
                </strong>
              </span>
            )}
            {scrim && <span>Location: {scrim.location}</span>}
          </>
        )}
        {!isMatch && !isScrim && !event.gameTime && (
          <span>No time set</span>
        )}
        {isMatch && (
          <>
            <span>
              {event.squad1Name}:{" "}
              {event.squad1StartsAt ? (
                <DateTime iso={event.squad1StartsAt} />
              ) : (
                <span className="font-mono text-gray-400 dark:text-gray-500">TBD</span>
              )}
            </span>
            <span>
              {event.squad2Name}:{" "}
              {event.squad2StartsAt ? (
                <DateTime iso={event.squad2StartsAt} />
              ) : (
                <span className="font-mono text-gray-400 dark:text-gray-500">TBD</span>
              )}
            </span>
          </>
        )}
        {isMatch && event.signupOpens && (
          <span className="text-xs">
            Signup opens <DateTime iso={event.signupOpens} />
          </span>
        )}
        {isMatch && event.signupCloses && (
          <span className="text-xs">
            Signup closes <DateTime iso={event.signupCloses} />
          </span>
        )}
        {!isMatch && !isScrim && (
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Simple Event
          </span>
        )}
        {isScrim && (
          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            Scrim
          </span>
        )}
      </div>

      {isScrim && scrim && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
          <p className="text-sm">
            <span className="font-semibold text-gray-900 dark:text-gray-100">Condition of Win:</span>{" "}
            <span className="text-gray-700 dark:text-gray-300">{scrim.winCondition}</span>
          </p>
          {scrim.result ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
              {scrim.resultDeclaredAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  declared <DateTime iso={scrim.resultDeclaredAt} mode="date" />
                </span>
              )}
              {scrim.resultNotes && (
                <p className="basis-full text-xs italic text-gray-600 dark:text-gray-400">
                  &ldquo;{scrim.resultNotes}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <ScrimResultForm scrimId={scrim.id} />
            </div>
          )}
        </div>
      )}
      {!event.deletedAt && !isScrim && (
        <div className="mb-6">
          <EditEventDatesForm
            eventId={event.id}
            kind={isMatch ? "match" : "simple"}
            squad1Name={event.squad1Name}
            squad2Name={event.squad2Name}
            gameTime={event.gameTime}
            signupOpens={event.signupOpens}
            signupCloses={event.signupCloses}
            squad1StartsAt={event.squad1StartsAt}
            squad2StartsAt={event.squad2StartsAt}
          />
        </div>
      )}

      {event.description && (
        <p className="mb-6 text-sm text-gray-700 dark:text-gray-300">{event.description}</p>
      )}

      {hasRoster && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-4">
            <div className="rounded-lg border p-3 dark:border-gray-800">
              <div className="text-2xl font-bold">
                {standing.taken} / {standing.capacity}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Slots Filled</div>
            </div>
            <div className="rounded-lg border p-3 dark:border-gray-800">
              <div className="text-2xl font-bold">{leadershipRequests.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Leadership Requests</div>
            </div>
            <div className="rounded-lg border p-3 dark:border-gray-800">
              <div className="text-2xl font-bold">{waitlistSignups.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Waitlist</div>
            </div>
            <div className="rounded-lg border p-3 dark:border-gray-800">
              <div className="text-2xl font-bold">
                {eventSignups.filter((s) => s.signup.attended).length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Attended</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold mb-3">
                {event.squad1Name} ({squad1Signups.length})
                {isScrim && (
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    Your guild
                  </span>
                )}
              </h2>
              <div className="space-y-2">
                {squad1Signups.map(({ signup, user }) => (
                  <AdminSignupRow
                    key={signup.id}
                    signup={signup}
                    userName={displayName(user, guildTag)}
                    userImage={user?.image || undefined}
                    squad1Name={event.squad1Name}
                    squad2Name={event.squad2Name}
                  />
                ))}
              </div>
            </section>

            {isScrim && opposingGuild && opposingEvent && (
              <section>
                <h2 className="text-lg font-semibold mb-3">
                  vs{" "}
                  {opposingGuild.tag
                    ? `[${opposingGuild.tag}] ${opposingGuild.name}`
                    : opposingGuild.name}{" "}
                  ({opposingRoster.length})
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    Opponent — read-only
                  </span>
                </h2>
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
              </section>
            )}

            {!isScrim && (
              <section>
                <h2 className="text-lg font-semibold mb-3">
                  {event.squad2Name} ({squad2Signups.length})
                </h2>
                <div className="space-y-2">
                  {squad2Signups.map(({ signup, user }) => (
                    <AdminSignupRow
                      key={signup.id}
                      signup={signup}
                      userName={displayName(user, guildTag)}
                      userImage={user?.image || undefined}
                      squad1Name={event.squad1Name}
                      squad2Name={event.squad2Name}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          {waitlistSignups.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Waitlist</h2>
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  {waitlistSignups.length}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                Ordered by signup time. Promote a player by changing their Assigned
                Role from &ldquo;waitlist&rdquo; to player, backup, or leader.
              </p>
              <div className="space-y-2">
                {waitlistSignups.map(({ signup, user }, i) => (
                  <div key={signup.id} className="flex items-start gap-3">
                    <span className="mt-3 inline-block w-6 text-right text-sm font-mono text-gray-400 dark:text-gray-500">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <AdminSignupRow
                        signup={signup}
                        userName={displayName(user, guildTag)}
                        userImage={user?.image || undefined}
                        squad1Name={event.squad1Name}
                        squad2Name={event.squad2Name}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
