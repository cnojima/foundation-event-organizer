import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { JoinGuildButton } from "@/components/join-guild-button";

export default async function GuildDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const membership = requireSignedInPage(session);

  const guild = await db.query.guilds.findFirst({
    where: and(eq(guilds.slug, slug), isNull(guilds.deletedAt)),
  });
  if (!guild) return notFound();

  const memberCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.guildId, guild.id))
    .get();
  const memberCount = Number(memberCountRow?.count ?? 0);

  const isMember = membership.guildId === guild.id;
  const isInOtherGuild = !!membership.guildId && !isMember;
  const canJoin = guild.isPublic && !membership.guildId;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{guild.name}</h1>
      <p className="mt-1 text-xs text-gray-500 font-mono dark:text-gray-400">{guild.slug}</p>
      {guild.description && (
        <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{guild.description}</p>
      )}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {memberCount} member{memberCount === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        {isMember && (
          <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            You&apos;re a member.
          </p>
        )}
        {isInOtherGuild && (
          <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">
            You&apos;re already in another guild. Leave it first to join this one.
          </p>
        )}
        {canJoin && <JoinGuildButton guildId={guild.id} />}
        {!guild.isPublic && !isMember && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            This guild is invite-only.
          </p>
        )}
      </div>
    </div>
  );
}
