import { db } from "@/db";
import { guilds } from "@/db/schema";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { isNull } from "drizzle-orm";
import Link from "next/link";
import { GlobalEventForm } from "@/components/global-event-form";

export default async function NewGlobalEventPage() {
  const session = await auth();
  requireSuperAdminPage(session);

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
            New Global Event
          </h1>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        Publishing this event will create a copy in every guild on the selected server.
        Guild admins cannot edit their copy — only opt out.
      </div>

      <GlobalEventForm serverNumbers={serverNumbers} mode="create" />
    </main>
  );
}
