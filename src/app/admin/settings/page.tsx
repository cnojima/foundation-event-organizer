import { db } from "@/db";
import { guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { GuildSettingsForm } from "@/components/guild-settings-form";
import { DiscordSettingsForm } from "@/components/discord-settings-form";
import { LeaveGuildButton } from "@/components/leave-guild-button";

export default async function GuildSettingsPage({
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

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  if (!guild) return <p className="text-red-600 dark:text-red-300">Guild not found.</p>;

  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  return (
    <div className="mx-auto max-w-2xl">
      {isImpersonating && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{guild.name}</strong> (super-admin override).
        </div>
      )}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Guild Settings
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Slug <code className="font-mono">{guild.slug}</code> is permanent.
      </p>

      <GuildSettingsForm
        guildId={guild.id}
        defaultName={guild.name}
        defaultDescription={guild.description ?? ""}
        defaultIsPublic={guild.isPublic}
        defaultServerNumber={guild.serverNumber != null ? String(guild.serverNumber) : ""}
        defaultTag={guild.tag ?? ""}
      />

      <div className="mt-6">
        <DiscordSettingsForm
          guildId={guild.id}
          defaultDiscordChannelId={guild.discordChannelId ?? ""}
          defaultSquad1VoiceChannelId={guild.squad1VoiceChannelId ?? ""}
          defaultSquad2VoiceChannelId={guild.squad2VoiceChannelId ?? ""}
        />
      </div>

      {!isImpersonating && (
        <section className="mt-10 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
            Danger zone
          </h2>
          <p className="mb-3 text-sm text-red-800 dark:text-red-300">
            Leaving this guild removes you and soft-deletes your past signups.
            If you&apos;re the only admin, promote someone else first.
          </p>
          <LeaveGuildButton />
        </section>
      )}
    </div>
  );
}
