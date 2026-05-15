import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { JoinGuildButton } from "@/components/join-guild-button";
import { PlayerCard, type PlayerCardData } from "@/components/player-card";

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

  const members = await db
    .select()
    .from(users)
    .where(eq(users.guildId, guild.id))
    .orderBy(users.guildRole, users.name);
  const memberCount = members.length;
  const adminCount = members.filter((m) => m.guildRole === "admin").length;

  const isMember = membership.guildId === guild.id;
  const isInOtherGuild = !!membership.guildId && !isMember;
  const canJoin = guild.isPublic && !membership.guildId;

  // Challenge is only viable when the viewer's guild shares a server # with
  // the displayed guild — duels are scoped per-server. Viewers without a
  // guild (or with no server # set) can't challenge anyone here.
  const viewerGuild = membership.guildId
    ? await db.query.guilds.findFirst({ where: eq(guilds.id, membership.guildId) })
    : null;
  const sameServer =
    !!viewerGuild?.serverNumber &&
    !!guild.serverNumber &&
    viewerGuild.serverNumber === guild.serverNumber;
  const challengeDisabledHint = !viewerGuild?.serverNumber
    ? "Set a Server # for your guild in Guild Settings to challenge players."
    : !guild.serverNumber
      ? "This guild hasn't set a Server # yet."
      : `You can only challenge players on Server #${viewerGuild.serverNumber}.`;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{guild.name}</h1>
      <p className="mt-1 text-xs text-gray-500 font-mono dark:text-gray-400">{guild.slug}</p>
      {guild.description && (
        <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">{guild.description}</p>
      )}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {memberCount} member{memberCount === 1 ? "" : "s"} · {adminCount} admin
        {adminCount === 1 ? "" : "s"}
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

      {members.length > 0 && (
        <div className="mt-8 space-y-2">
          {members.map((m) => {
            const card: PlayerCardData = {
              id: m.id,
              inGameName: m.inGameName,
              image: m.image,
              powerTier: m.powerTier,
              duelRating: m.duelRating,
              duelWins: m.duelWins,
              duelLosses: m.duelLosses,
              duelDraws: m.duelDraws,
              feedbackUpCount: m.feedbackUpCount,
              feedbackDownCount: m.feedbackDownCount,
              lastDuelAt: m.lastDuelAt,
              guildName: guild.name,
              guildTag: guild.tag,
            };
            const isSelf = m.id === membership.userId;
            return (
              <PlayerCard
                key={m.id}
                player={card}
                sameGuild={isMember}
                canChallenge={!isMember && !isSelf && sameServer}
                challengeDisabledHint={challengeDisabledHint}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
