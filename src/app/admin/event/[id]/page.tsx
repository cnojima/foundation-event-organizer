import { db } from "@/db";
import { events, signups, users, guilds } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import { AdminSignupRow } from "@/components/admin-signup-row";
import { computeStanding, WAITLIST_ROLE } from "@/lib/waitlist";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { DeleteEventButton } from "@/components/delete-event-button";
import { EditEventDatesForm } from "@/components/edit-event-dates-form";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";

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

  const eventSignups = isMatch
    ? await db
        .select({ signup: signups, user: users })
        .from(signups)
        .leftJoin(users, eq(signups.userId, users.id))
        .where(and(eq(signups.eventId, id), isNull(signups.deletedAt)))
    : [];

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
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{event.name}</h1>
          {event.deletedAt && (
            <span className="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gray-600">
              Deleted
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This event was deleted on{" "}
          <DateTime iso={event.deletedAt} />. Signup data is retained for
          attendance reports.
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
        {!isMatch && (
          <span>
            {event.gameTime ? (
              <>
                Starts: <DateTime iso={event.gameTime} />
              </>
            ) : (
              "No time set"
            )}
          </span>
        )}
        {isMatch && (
          <>
            <span>
              {event.squad1Name}:{" "}
              {event.squad1StartsAt ? (
                <DateTime iso={event.squad1StartsAt} />
              ) : (
                <span className="font-mono text-gray-400">TBD</span>
              )}
            </span>
            <span>
              {event.squad2Name}:{" "}
              {event.squad2StartsAt ? (
                <DateTime iso={event.squad2StartsAt} />
              ) : (
                <span className="font-mono text-gray-400">TBD</span>
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
        {!isMatch && (
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-gray-600">
            Simple Event
          </span>
        )}
      </div>
      {!event.deletedAt && (
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
        <p className="mb-6 text-sm text-gray-700">{event.description}</p>
      )}

      {isMatch && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4 sm:gap-4">
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold">
                {standing.taken} / {standing.capacity}
              </div>
              <div className="text-sm text-gray-500">Slots Filled</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold">{leadershipRequests.length}</div>
              <div className="text-sm text-gray-500">Leadership Requests</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold">{waitlistSignups.length}</div>
              <div className="text-sm text-gray-500">Waitlist</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold">
                {eventSignups.filter((s) => s.signup.attended).length}
              </div>
              <div className="text-sm text-gray-500">Attended</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold mb-3">
                {event.squad1Name} ({squad1Signups.length})
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
          </div>

          {waitlistSignups.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Waitlist</h2>
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {waitlistSignups.length}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-500">
                Ordered by signup time. Promote a player by changing their Assigned
                Role from &ldquo;waitlist&rdquo; to player, backup, or leader.
              </p>
              <div className="space-y-2">
                {waitlistSignups.map(({ signup, user }, i) => (
                  <div key={signup.id} className="flex items-start gap-3">
                    <span className="mt-3 inline-block w-6 text-right text-sm font-mono text-gray-400">
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
