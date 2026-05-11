import { db } from "@/db";
import { events, guilds } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { effectiveStartIso, squadTimes } from "@/lib/event-times";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p className="text-red-600">Guild not found.</p>
      </main>
    );
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });

  const allEvents = await db
    .select()
    .from(events)
    .where(eq(events.guildId, targetGuildId))
    .orderBy(desc(events.createdAt));

  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const guildSuffix = isImpersonating ? `?guildId=${targetGuildId}` : "";

  // Active events split by upcoming vs past based on the earliest scheduled
  // start time; events with no time set fall into "upcoming" so admins can
  // schedule them.
  const nowIso = new Date().toISOString();
  const active = allEvents.filter((e) => !e.deletedAt);
  const upcoming = active.filter((e) => {
    const start = effectiveStartIso(e);
    return !start || start >= nowIso;
  });
  const past = active.filter((e) => {
    const start = effectiveStartIso(e);
    return !!start && start < nowIso;
  });
  const deletedEvents = allEvents.filter((e) => e.deletedAt);

  return (
    <main className="max-w-4xl mx-auto p-6">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {actingGuild ? `${actingGuild.name} — Manage Events` : "Manage Events"}
        </h1>
        <Link
          href={`/admin/event/new${guildSuffix}`}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + New event
        </Link>
      </div>

      <EventSection
        title="Upcoming"
        rows={upcoming}
        emptyMessage="No upcoming events. Click '+ New event' to create one."
        guildSuffix={guildSuffix}
      />

      {past.length > 0 && (
        <EventSection
          title="Past"
          rows={past}
          emptyMessage=""
          guildSuffix={guildSuffix}
          muted
        />
      )}

      {deletedEvents.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-600">
            Deleted ({deletedEvents.length})
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            Kept for attendance reports. Click to view.
          </p>
          <div className="space-y-2">
            {deletedEvents.map((event) => (
              <Link
                key={event.id}
                href={`/admin/event/${event.id}${guildSuffix}`}
                className="block rounded-lg border border-gray-200 p-4 opacity-60 hover:opacity-100 hover:border-gray-400"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium line-through">{event.name}</span>
                    <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                      Deleted
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {event.deletedAt && (
                      <DateTime iso={event.deletedAt} mode="date" />
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

type EventRow = typeof events.$inferSelect;

function EventSection({
  title,
  rows,
  emptyMessage,
  guildSuffix,
  muted = false,
}: {
  title: string;
  rows: EventRow[];
  emptyMessage: string;
  guildSuffix: string;
  muted?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2
        className={`mb-3 text-lg font-semibold ${muted ? "text-gray-500" : "text-gray-900"}`}
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        emptyMessage ? <p className="text-sm text-gray-500">{emptyMessage}</p> : null
      ) : (
        <div className="space-y-2">
          {rows.map((event) => (
            <Link
              key={event.id}
              href={`/admin/event/${event.id}${guildSuffix}`}
              className={`block rounded-lg border bg-white p-4 transition-colors ${
                muted
                  ? "border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300"
                  : "border-gray-200 hover:border-violet-400"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {event.name}
                    </span>
                    <KindBadge kind={event.kind} />
                  </div>
                  <EventTimesLine event={event} />
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  Created <DateTime iso={event.createdAt} mode="date" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function KindBadge({ kind }: { kind: EventRow["kind"] }) {
  const styles =
    kind === "match"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : kind === "scrim"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-gray-200 bg-gray-50 text-gray-600";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles}`}
    >
      {kind}
    </span>
  );
}

function EventTimesLine({ event }: { event: EventRow }) {
  if (event.kind === "simple") {
    return (
      <p className="mt-1 text-xs text-gray-500">
        {event.gameTime ? (
          <>
            Starts: <DateTime iso={event.gameTime} showUTC={false} />
          </>
        ) : (
          <span className="font-mono text-gray-400">No time set</span>
        )}
      </p>
    );
  }
  const squads = squadTimes(event);
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
      {squads.map((s) => (
        <span key={s.name}>
          {s.name}:{" "}
          {s.startsAt ? (
            <DateTime iso={s.startsAt} showUTC={false} />
          ) : (
            <span className="font-mono text-gray-400">TBD</span>
          )}
        </span>
      ))}
    </div>
  );
}
