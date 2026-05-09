import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { requireSignedInPage } from "@/lib/rbac";
import { JoinGuildButton } from "@/components/join-guild-button";

export default async function GuildsPage() {
  const session = await auth();
  const membership = requireSignedInPage(session);

  const rows = await db
    .select({
      id: guilds.id,
      name: guilds.name,
      slug: guilds.slug,
      description: guilds.description,
      memberCount: sql<number>`(select count(*) from ${users} where ${users.guildId} = ${guilds.id})`,
    })
    .from(guilds)
    .where(and(eq(guilds.isPublic, true), isNull(guilds.deletedAt)))
    .orderBy(guilds.name);

  const inAGuild = !!membership.guildId;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Guilds</h1>
          <p className="mt-1 text-sm text-gray-500">
            {inAGuild
              ? "You're already a member of a guild. To join another, leave your current one first."
              : "Join an existing guild, create your own, or use an invite link."}
          </p>
        </div>
        {!inAGuild && (
          <Link
            href="/guilds/new"
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Create Guild
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-500">No public guilds yet. Be the first to create one.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((guild) => (
            <div
              key={guild.id}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-violet-400"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/guilds/${guild.slug}`}
                    className="text-lg font-semibold text-gray-900 hover:text-violet-700"
                  >
                    {guild.name}
                  </Link>
                  {guild.description && (
                    <p className="mt-1 text-sm text-gray-600">{guild.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {guild.memberCount} member{guild.memberCount === 1 ? "" : "s"}
                  </p>
                </div>
                {!inAGuild && <JoinGuildButton guildId={guild.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
