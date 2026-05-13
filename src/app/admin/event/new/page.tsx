import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { CreateEventForm } from "@/components/create-event-form";

export default async function NewEventPage({
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
        <p className="text-red-600 dark:text-red-300">Guild not found.</p>
      </main>
    );
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const adminListHref = isImpersonating
    ? `/admin?guildId=${targetGuildId}`
    : "/admin";

  return (
    <main className="max-w-3xl mx-auto p-6">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {actingGuild ? `${actingGuild.name} — New Event` : "New Event"}
        </h1>
        <Link
          href={adminListHref}
          className="text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          ← Back to events
        </Link>
      </div>
      <CreateEventForm
        guildIdOverride={isImpersonating ? targetGuildId : undefined}
      />
    </main>
  );
}
