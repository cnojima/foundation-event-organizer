import { db } from "@/db";
import { eventTemplates, guilds } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { TemplatesAdmin, type AdminTemplate } from "@/components/templates-admin";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return <p className="text-red-600 dark:text-red-300">Guild not found.</p>;
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  const rows = await db
    .select()
    .from(eventTemplates)
    .where(
      and(
        eq(eventTemplates.guildId, targetGuildId),
        isNull(eventTemplates.deletedAt)
      )
    )
    .orderBy(asc(eventTemplates.templateName));

  // Narrow the raw Drizzle row shape to what the client expects (drop
  // guildId, createdAt, deletedAt — those aren't surfaced in the UI).
  const templates: AdminTemplate[] = rows.map((r) => ({
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
    <div className="mx-auto max-w-3xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {actingGuild ? `${actingGuild.name} — Event Templates` : "Event Templates"}
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Reusable presets that pre-populate the create-event form. Date/time
        is never stored — only the signup window encodes a UTC weekday +
        time-of-day that snaps to the event&apos;s start when applied.
      </p>

      <TemplatesAdmin guildId={targetGuildId} templates={templates} />
    </div>
  );
}
