import { db } from "@/db";
import { events, signups } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { squadTimes } from "@/lib/event-times";

export default async function Home() {
  const session = await auth();
  const membership = requireSignedInPage(session);

  const cookieStore = await cookies();
  if (!cookieStore.get("help_viewed")) redirect("/help");

  if (!membership.guildId) redirect("/guilds");

  const guildEvents = await db
    .select()
    .from(events)
    .where(
      and(eq(events.guildId, membership.guildId!), isNull(events.deletedAt))
    )
    .orderBy(desc(events.createdAt));

  // Which of those events has the current user already signed up for? Drives
  // the "needs your attention" emphasis on cards below.
  const signedUpEventIds = new Set<string>();
  if (guildEvents.length > 0) {
    const matchEventIds = guildEvents
      .filter((e) => e.kind === "match")
      .map((e) => e.id);
    if (matchEventIds.length > 0) {
      const rows = await db
        .select({ eventId: signups.eventId })
        .from(signups)
        .where(
          and(
            eq(signups.userId, membership.userId),
            inArray(signups.eventId, matchEventIds),
            isNull(signups.deletedAt)
          )
        );
      for (const r of rows) signedUpEventIds.add(r.eventId);
    }
  }

  const now = new Date().toISOString();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Events</h1>
      </div>

      {guildEvents.length === 0 ? (
        <p className="text-gray-500">No events yet.</p>
      ) : (
        <div className="space-y-3">
          {guildEvents.map((event) => {
            const isOpen =
              (!event.signupOpens || event.signupOpens <= now) &&
              (!event.signupCloses || event.signupCloses > now);
            const isMatch = event.kind === "match";
            const signedUp = signedUpEventIds.has(event.id);
            // Emphasize match events that are still actionable (open and not
            // yet signed up). Closed events and simple events stay neutral.
            const needsAction = isMatch && isOpen && !signedUp;

            return (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className={`block rounded-lg border bg-white p-4 transition-colors ${
                  needsAction
                    ? "border-violet-300 ring-1 ring-violet-200 hover:border-violet-500 hover:ring-violet-300"
                    : signedUp
                      ? "border-gray-200 opacity-80 hover:opacity-100 hover:border-gray-300"
                      : "border-gray-200 hover:border-violet-400"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{event.name}</h2>
                    {event.description && (
                      <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                    )}
                    {event.kind === "simple" && event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500">
                        Starts: <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                    {isMatch && (
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {squadTimes(event).map((s) => (
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
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isMatch && signedUp && (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        ✓ Signed up
                      </span>
                    )}
                    {isMatch && !signedUp && isOpen && (
                      <span className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">
                        Sign up
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        isOpen
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {isOpen ? "Open" : "Closed"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
