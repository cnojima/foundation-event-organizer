import { db } from "@/db";
import { globalEvents, guilds } from "@/db/schema";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GlobalEventForm } from "@/components/global-event-form";

export default async function EditGlobalEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  requireSuperAdminPage(session);

  const globalEvent = await db.query.globalEvents.findFirst({
    where: and(eq(globalEvents.id, id), isNull(globalEvents.deletedAt)),
  });
  if (!globalEvent) notFound();

  const serverNumberRows = await db
    .selectDistinct({ serverNumber: guilds.serverNumber })
    .from(guilds)
    .where(isNull(guilds.deletedAt))
    .orderBy(guilds.serverNumber);

  const serverNumbers = serverNumberRows
    .map((r) => r.serverNumber)
    .filter((n): n is number => n != null);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/super-admin/global-events"
            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Global Events
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Edit: {globalEvent.name}
          </h1>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        Saving will propagate changes to all guild copies that have not been opted out.
      </div>

      <GlobalEventForm
        serverNumbers={serverNumbers}
        defaults={{
          name: globalEvent.name,
          description: globalEvent.description ?? undefined,
          kind: globalEvent.kind,
          serverNumber: globalEvent.serverNumber,
          gameTime: globalEvent.gameTime,
          squad1StartsAt: globalEvent.squad1StartsAt,
          squad2StartsAt: globalEvent.squad2StartsAt,
          signupOpens: globalEvent.signupOpens,
          signupCloses: globalEvent.signupCloses,
          squad1Name: globalEvent.squad1Name,
          squad2Name: globalEvent.squad2Name,
          maxPlayers: globalEvent.maxPlayers,
          maxBackups: globalEvent.maxBackups,
          leadershipSlots: globalEvent.leadershipSlots,
          durationMinutes: globalEvent.durationMinutes,
        }}
        mode="edit"
        globalEventId={globalEvent.id}
      />
    </main>
  );
}
