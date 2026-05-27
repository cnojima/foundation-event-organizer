import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { eventTemplates, guilds } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { CreateEventForm } from "@/components/create-event-form";
import type { AdminTemplate } from "@/components/templates-admin";

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
    ? `/?guildId=${targetGuildId}`
    : "/";

  const templateRows = await db
    .select()
    .from(eventTemplates)
    .where(
      and(
        eq(eventTemplates.guildId, targetGuildId),
        isNull(eventTemplates.deletedAt)
      )
    )
    .orderBy(asc(eventTemplates.templateName));
  const templates: AdminTemplate[] = templateRows.map((r) => ({
    id: r.id,
    templateName: r.templateName,
    eventName: r.eventName,
    description: r.description,
    kind: r.kind,
    squad1Name: r.squad1Name,
    squad2Name: r.squad2Name,
    maxPlayers: r.maxPlayers,
    maxBackups: r.maxBackups,
    leadershipSlots: r.leadershipSlots,
    durationMinutes: r.durationMinutes,
    signupOpensWeekday: r.signupOpensWeekday,
    signupOpensTimeUtc: r.signupOpensTimeUtc,
    signupClosesWeekday: r.signupClosesWeekday,
    signupClosesTimeUtc: r.signupClosesTimeUtc,
  }));

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
        templates={templates}
        templatesEditHref={
          isImpersonating
            ? `/admin/templates?guildId=${targetGuildId}`
            : "/admin/templates"
        }
      />
    </main>
  );
}
