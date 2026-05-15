import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { requireAnyGuildPage } from "@/lib/rbac";
import { displayName } from "@/lib/display";
import { ProposeDuelForm } from "@/components/propose-duel-form";

export const metadata = {
  title: "Propose a Duel",
};

export default async function NewDuelPage({
  searchParams,
}: {
  searchParams: Promise<{ opponent?: string }>;
}) {
  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const { opponent: preselectedOpponentId } = await searchParams;

  // Resolve viewer's server #. Without one, cross-guild challenges are
  // impossible — surface a hint.
  const viewerGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, membership.guildId!),
  });
  const viewerServerNumber = viewerGuild?.serverNumber ?? null;

  if (!viewerServerNumber) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Propose a Duel
        </h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Your guild needs a Server # set before you can propose duels. Ask
          your guild admin to set it in{" "}
          <Link className="underline font-semibold" href="/admin/settings">
            Guild Settings
          </Link>
          .
        </div>
      </main>
    );
  }

  // Same-server guilds → IDs we can pull players from.
  const sameServerGuildIds = (
    await db
      .select({ id: guilds.id, tag: guilds.tag })
      .from(guilds)
      .where(
        and(
          eq(guilds.serverNumber, viewerServerNumber),
          isNull(guilds.deletedAt)
        )
      )
  ).map((g) => g.id);

  // Build the opponent list: same-server, discoverable, not me, has a name.
  const opponents =
    sameServerGuildIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            inGameName: users.inGameName,
            powerTier: users.powerTier,
            duelRating: users.duelRating,
            guildTag: guilds.tag,
          })
          .from(users)
          .innerJoin(guilds, eq(users.guildId, guilds.id))
          .where(
            and(
              eq(users.discoverableForDuels, true),
              ne(users.id, membership.userId),
              sql`${users.guildId} IN (${sql.join(
                sameServerGuildIds.map((id) => sql`${id}`),
                sql.raw(", ")
              )})`,
              sql`${users.inGameName} IS NOT NULL AND TRIM(${users.inGameName}) != ''`
            )
          )
          .orderBy(asc(users.inGameName));

  const formOpponents = opponents.map((o) => ({
    id: o.id,
    displayName: displayName(o, o.guildTag),
    powerTier: o.powerTier,
    duelRating: o.duelRating,
  }));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/duels" className="text-sm text-violet-700 hover:underline dark:text-violet-300">
        ← Back to duels
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Propose a Duel
      </h1>
      <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
        Challenge another player on your same server (#{viewerServerNumber}) to
        a 1v1. They&apos;ll get a Discord notification and can accept or
        decline.
      </p>
      <p className="mb-6 text-xs">
        <Link href="/help#duels" className="text-violet-700 hover:underline dark:text-violet-300">
          How duels work →
        </Link>
      </p>

      <ProposeDuelForm
        opponents={formOpponents}
        preselectedOpponentId={preselectedOpponentId}
      />
    </main>
  );
}
