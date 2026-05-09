import { db } from "@/db";
import { events, guilds } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { CreateEventForm } from "@/components/create-event-form";
import { DateTime } from "@/components/date-time";

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

  const activeEvents = allEvents.filter((e) => !e.deletedAt);
  const deletedEvents = allEvents.filter((e) => e.deletedAt);
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  return (
    <main className="max-w-4xl mx-auto p-6">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <h1 className="text-3xl font-bold mb-6">
        {actingGuild ? `${actingGuild.name} — Admin` : "Admin Panel"}
      </h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Create Event</h2>
        <CreateEventForm guildIdOverride={isImpersonating ? targetGuildId : undefined} />
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
                href={`/admin/event/${event.id}${
                  isImpersonating ? `?guildId=${targetGuildId}` : ""
                }`}
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
                href={`/admin/event/${event.id}${
                  isImpersonating ? `?guildId=${targetGuildId}` : ""
                }`}
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

