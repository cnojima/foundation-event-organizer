import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, isNull } from "drizzle-orm";
import Link from "next/link";
import { CalendarDownloadLink } from "@/components/calendar-download-link";
import { DateTime } from "@/components/date-time";

export default async function Home() {
  const allEvents = await db
    .select()
    .from(events)
    .where(isNull(events.deletedAt))
    .orderBy(desc(events.createdAt));

  const now = new Date().toISOString();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Events</h1>
        <CalendarDownloadLink
          href="/api/events/recurring/ics"
          label="Weekly Saturday 18:00 UTC"
        />
      </div>

      {allEvents.length === 0 ? (
        <p className="text-gray-500">No events yet.</p>
      ) : (
        <div className="space-y-3">
          {allEvents.map((event) => {
            const isOpen =
              (!event.signupOpens || event.signupOpens <= now) &&
              (!event.signupCloses || event.signupCloses > now);

            return (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{event.name}</h2>
                    {event.description && (
                      <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                    )}
                    {event.gameTime && (
                      <p className="mt-1 text-xs text-gray-500">
                        Game: <DateTime iso={event.gameTime} showUTC={false} />
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                      isOpen
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {isOpen ? "Open" : "Closed"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
