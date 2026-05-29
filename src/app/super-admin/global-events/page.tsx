import { db } from "@/db";
import { globalEvents } from "@/db/schema";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { DateTime } from "@/components/date-time";
import { DeleteGlobalEventButton } from "@/components/delete-global-event-button";

export default async function GlobalEventsPage() {
  const session = await auth();
  requireSuperAdminPage(session);

  const rows = await db
    .select({
      id: globalEvents.id,
      name: globalEvents.name,
      kind: globalEvents.kind,
      serverNumber: globalEvents.serverNumber,
      gameTime: globalEvents.gameTime,
      squad1StartsAt: globalEvents.squad1StartsAt,
      createdAt: globalEvents.createdAt,
      deletedAt: globalEvents.deletedAt,
      guildCopyCount: sql<number>`(
        select count(*) from events
        where events.global_event_id = ${globalEvents.id}
          and events.deleted_at is null
      )`,
    })
    .from(globalEvents)
    .orderBy(globalEvents.createdAt);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/super-admin"
            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Super Admin
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Global Events
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Server-wide events that are published to all guilds on a given server.
          </p>
        </div>
        <Link
          href="/super-admin/global-events/new"
          className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + New global event
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No global events yet.{" "}
          <Link href="/super-admin/global-events/new" className="font-semibold text-violet-600 hover:underline dark:text-violet-400">
            Create one
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const startTime = row.squad1StartsAt ?? row.gameTime;
            return (
              <div
                key={row.id}
                className={`flex items-center justify-between gap-4 rounded-lg border bg-white px-4 py-3 dark:bg-gray-900 ${
                  row.deletedAt
                    ? "border-gray-200 opacity-60 dark:border-gray-800"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {row.name}
                    </span>
                    <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                      Server {row.serverNumber}
                    </span>
                    <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      {row.kind}
                    </span>
                    {row.deletedAt && (
                      <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                        Deleted
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {row.guildCopyCount} guild cop{row.guildCopyCount === 1 ? "y" : "ies"}
                    {startTime && (
                      <>
                        {" "}· Starts <DateTime iso={startTime} mode="datetime" />
                      </>
                    )}
                    {" "}· Created <DateTime iso={row.createdAt} mode="date" />
                  </p>
                </div>
                {!row.deletedAt && (
                  <div className="flex items-center gap-2 text-xs">
                    <Link
                      href={`/super-admin/global-events/${row.id}/edit`}
                      className="rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
                    >
                      Edit
                    </Link>
                    <DeleteGlobalEventButton globalEventId={row.id} eventName={row.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
