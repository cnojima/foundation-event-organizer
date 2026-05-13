import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireAnyGuildPage } from "@/lib/rbac";
import { PlayerCard, type PlayerCardData } from "@/components/player-card";
import { PlayerSearchForm } from "@/components/player-search-form";

const PAGE_SIZE = 25;

// Minimum confirmed duels before a player appears on the leaderboard.
// Without this, a single 1-0 win at 1024 would sit near the top alongside
// veteran 1800+ players. Three is enough to suggest engagement without
// being gate-y.
const MIN_DUELS_FOR_LEADERBOARD = 3;

export const metadata = {
  title: "Leaderboard — Foundation Event Organizer",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    powerTier?: string;
    guildId?: string;
  }>;
}) {
  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const t = await getTranslations("leaderboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const powerTier = params.powerTier ?? "";
  const filterGuildId = params.guildId ?? "";

  const viewerGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, membership.guildId!),
  });
  const viewerServerNumber = viewerGuild?.serverNumber ?? null;

  if (!viewerServerNumber) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {t.rich("needsServerNumber", {
            settingsLink: (c) => (
              <Link
                className="underline font-semibold"
                href="/admin/settings"
              >
                {c}
              </Link>
            ),
          })}
        </div>
      </main>
    );
  }

  // Same-server guilds: populate the filter dropdown + scope the listing.
  const sameServerGuilds = await db
    .select({ id: guilds.id, name: guilds.name, tag: guilds.tag })
    .from(guilds)
    .where(
      and(
        eq(guilds.serverNumber, viewerServerNumber),
        isNull(guilds.deletedAt)
      )
    )
    .orderBy(asc(guilds.name));
  const sameServerGuildIds = sameServerGuilds.map((g) => g.id);

  // Base WHERE applies to both the listing query and the "your rank"
  // computation — `discoverableForDuels`, same server, min activity,
  // valid name, alive guild. Filters (powerTier, guildId) are listing-
  // only so the viewer's rank doesn't shift when they twiddle filters.
  const baseConditions = [
    eq(users.discoverableForDuels, true),
    sql`(${users.duelWins} + ${users.duelLosses} + ${users.duelDraws}) >= ${MIN_DUELS_FOR_LEADERBOARD}`,
    sql`${users.inGameName} IS NOT NULL AND TRIM(${users.inGameName}) != ''`,
  ];
  if (sameServerGuildIds.length > 0) {
    baseConditions.push(
      sql`${users.guildId} IN (${sql.join(
        sameServerGuildIds.map((id) => sql`${id}`),
        sql.raw(", ")
      )})`
    );
  } else {
    // No same-server guilds — empty list.
    baseConditions.push(sql`1 = 0`);
  }

  const listingConditions = [...baseConditions];
  if (powerTier) {
    listingConditions.push(eq(users.powerTier, powerTier as "I"));
  }
  if (filterGuildId && sameServerGuildIds.includes(filterGuildId)) {
    listingConditions.push(eq(users.guildId, filterGuildId));
  }
  if (q) {
    listingConditions.push(
      sql`LOWER(${users.inGameName}) LIKE ${"%" + q.toLowerCase() + "%"}`
    );
  }
  const listingWhere = and(...listingConditions);

  // Total count + page-of-rows for the visible list.
  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .innerJoin(guilds, eq(users.guildId, guilds.id))
    .where(listingWhere)
    .get();
  const total = Number(totalRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: users.id,
      inGameName: users.inGameName,
      image: users.image,
      powerTier: users.powerTier,
      duelRating: users.duelRating,
      duelWins: users.duelWins,
      duelLosses: users.duelLosses,
      duelDraws: users.duelDraws,
      feedbackUpCount: users.feedbackUpCount,
      feedbackDownCount: users.feedbackDownCount,
      lastDuelAt: users.lastDuelAt,
      guildId: users.guildId,
      guildName: guilds.name,
      guildTag: guilds.tag,
    })
    .from(users)
    .innerJoin(guilds, eq(users.guildId, guilds.id))
    .where(listingWhere)
    .orderBy(desc(users.duelRating), asc(users.inGameName))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Compute viewer's own rank: how many players (same server, eligible)
  // have a STRICTLY HIGHER rating than the viewer, plus 1. Only computed
  // if the viewer is eligible (≥3 duels, discoverable, named); otherwise
  // we surface a hint instead of a rank.
  const me = await db.query.users.findFirst({
    where: eq(users.id, membership.userId),
  });
  const myTotalDuels =
    (me?.duelWins ?? 0) + (me?.duelLosses ?? 0) + (me?.duelDraws ?? 0);
  const myEligible =
    me?.discoverableForDuels === true &&
    !!me?.inGameName?.trim() &&
    myTotalDuels >= MIN_DUELS_FOR_LEADERBOARD;

  let myRank: number | null = null;
  if (myEligible && me) {
    const higherRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .innerJoin(guilds, eq(users.guildId, guilds.id))
      .where(
        and(
          ...baseConditions,
          gt(users.duelRating, me.duelRating),
          ne(users.id, me.id)
        )
      )
      .get();
    myRank = Number(higherRow?.count ?? 0) + 1;
  }

  // PlayerCard data shape, with the per-row rank pre-computed so we don't
  // re-derive it in the JSX. Rank in this list = offset + index + 1 (NOT
  // myRank — that's the viewer's global rank).
  const ranked = rows.map((r, i) => ({
    rank: offset + i + 1,
    card: {
      id: r.id,
      inGameName: r.inGameName,
      image: r.image,
      powerTier: r.powerTier,
      duelRating: r.duelRating,
      duelWins: r.duelWins,
      duelLosses: r.duelLosses,
      duelDraws: r.duelDraws,
      feedbackUpCount: r.feedbackUpCount,
      feedbackDownCount: r.feedbackDownCount,
      lastDuelAt: r.lastDuelAt,
      guildName: r.guildName,
      guildTag: r.guildTag,
    } satisfies PlayerCardData,
    sameGuild: r.guildId === membership.guildId,
    isMe: r.id === membership.userId,
  }));

  function pageHref(p: number): string {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (powerTier) qs.set("powerTier", powerTier);
    if (filterGuildId) qs.set("guildId", filterGuildId);
    if (p > 1) qs.set("page", String(p));
    return `/leaderboard${qs.toString() ? `?${qs.toString()}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t("serverLabel", { serverNumber: viewerServerNumber })}
        </span>
      </div>
      <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
        {t("subtitle", { count: total })}
      </p>
      <p className="mb-4 text-xs">
        <Link href="/help#duels" className="text-violet-700 hover:underline dark:text-violet-300">
          {t("howItWorks")}
        </Link>
      </p>

      {/* Your-rank callout — separate from filters because filters don't
          change your global rank. */}
      <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm dark:border-violet-900/60 dark:bg-violet-950/20">
        {myRank !== null && me ? (
          <p className="text-violet-900 dark:text-violet-200">
            {t("yourRank", {
              rank: myRank,
              rating: me.duelRating,
            })}
          </p>
        ) : (
          <p className="text-gray-700 dark:text-gray-300">
            {t("notRankedYet", { min: MIN_DUELS_FOR_LEADERBOARD })}
          </p>
        )}
      </div>

      <div className="mb-4">
        <PlayerSearchForm
          guildOptions={sameServerGuilds.map((g) => ({ id: g.id, name: g.name }))}
          defaultQ={q}
          defaultPowerTier={powerTier}
          defaultGuildId={filterGuildId}
        />
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          {powerTier || filterGuildId ? t("noMatches") : t("emptyState")}
        </p>
      ) : (
        <ol className="space-y-2">
          {ranked.map(({ rank, card, sameGuild, isMe }) => (
            <li
              key={card.id}
              className={`flex items-stretch gap-3 ${
                isMe ? "rounded-lg ring-2 ring-violet-300 dark:ring-violet-800" : ""
              }`}
            >
              <div
                className={`flex w-12 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold ${
                  rank === 1
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : rank === 2
                      ? "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      : rank === 3
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                        : "bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400"
                }`}
                aria-label={t("rankLabel", { rank })}
              >
                #{rank}
              </div>
              <div className="min-w-0 flex-1">
                <PlayerCard player={card} sameGuild={sameGuild} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <Link
            href={pageHref(Math.max(1, currentPage - 1))}
            className={`rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold dark:border-gray-700 dark:bg-gray-900 ${
              currentPage > 1
                ? "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                : "pointer-events-none opacity-40 dark:text-gray-400"
            }`}
            aria-disabled={currentPage === 1}
          >
            {t("prev")}
          </Link>
          <span className="text-gray-500 dark:text-gray-400">
            {t("pageOf", { page: currentPage, total: totalPages })}
          </span>
          <Link
            href={pageHref(Math.min(totalPages, currentPage + 1))}
            className={`rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold dark:border-gray-700 dark:bg-gray-900 ${
              currentPage < totalPages
                ? "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                : "pointer-events-none opacity-40 dark:text-gray-400"
            }`}
            aria-disabled={currentPage === totalPages}
          >
            {t("next")}
          </Link>
        </nav>
      )}
    </main>
  );
}
