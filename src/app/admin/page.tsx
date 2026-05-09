import { db } from "@/db";
import { events } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { CreateEventForm } from "@/components/create-event-form";
import { DateTime } from "@/components/date-time";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  if (!(await isAdmin(session.user.id))) redirect("/");

  const allEvents = await db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt));

  const activeEvents = allEvents.filter((e) => !e.deletedAt);
  const deletedEvents = allEvents.filter((e) => e.deletedAt);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Create Event</h2>
        <CreateEventForm />
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Events</h2>
        {activeEvents.length === 0 ? (
          <p className="text-gray-500">No events yet.</p>
        ) : (
          <div className="space-y-3">
            {activeEvents.map((event) => (
              <Link
                key={event.id}
                href={`/admin/event/${event.id}`}
                className="block border rounded-lg p-4 hover:border-blue-500"
              >
                <div className="flex justify-between">
                  <span className="font-medium">{event.name}</span>
                  <span className="text-sm text-gray-500">
                    <DateTime iso={event.createdAt} mode="date" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {deletedEvents.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-600">
            Deleted ({deletedEvents.length})
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            Kept for attendance reports. Click to view.
          </p>
          <div className="space-y-3">
            {deletedEvents.map((event) => (
              <Link
                key={event.id}
                href={`/admin/event/${event.id}`}
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
