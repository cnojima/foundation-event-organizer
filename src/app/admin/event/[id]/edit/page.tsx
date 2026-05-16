import { db } from "@/db";
import { events, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage } from "@/lib/rbac";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { EditEventForm, type EditEventFormInitial } from "@/components/edit-event-form";

export const metadata = {
  title: "Edit event",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const membership = requireGuildAdminPage(session);

  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event) return notFound();

  // Must be admin of the event's guild (super-admins implicitly admin
  // everywhere).
  if (
    !membership.isSuperAdmin &&
    !(membership.guildRole === "admin" && membership.guildId === event.guildId)
  ) {
    redirect("/");
  }

  if (event.deletedAt) {
    // Deleted events are read-only — edits would risk reanimating reminders.
    // Bounce admins back to the (read-only) admin event page so they can
    // restore via super-admin tools if needed.
    redirect(`/admin/event/${event.id}`);
  }

  const isImpersonating =
    membership.isSuperAdmin && event.guildId !== membership.guildId;
  const guildSuffix = isImpersonating ? `?guildId=${event.guildId}` : "";
  const actingGuild = isImpersonating
    ? await db.query.guilds.findFirst({ where: eq(guilds.id, event.guildId) })
    : null;

  const initial: EditEventFormInitial = {
    id: event.id,
    kind: event.kind,
    name: event.name,
    description: event.description,
    squad1Name: event.squad1Name,
    squad2Name: event.squad2Name,
    maxPlayers: event.maxPlayers,
    maxBackups: event.maxBackups,
    leadershipSlots: event.leadershipSlots,
    gameTime: event.gameTime,
    signupOpens: event.signupOpens,
    signupCloses: event.signupCloses,
    squad1StartsAt: event.squad1StartsAt,
    squad2StartsAt: event.squad2StartsAt,
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      {actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <Link
        href={`/event/${event.id}`}
        className="text-sm text-violet-700 hover:underline dark:text-violet-300"
      >
        ← Back to event
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Edit event
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Editing <strong>{event.name}</strong>. Roster, attendance, and signups
        are managed separately on the admin event page.
      </p>

      <EditEventForm
        initial={initial}
        cancelHref={`/event/${event.id}${guildSuffix}`}
        successHref={`/event/${event.id}${guildSuffix}`}
      />
    </main>
  );
}
