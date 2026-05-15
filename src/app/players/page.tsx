import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, asc, desc, eq, ne, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireAnyGuildPage } from "@/lib/rbac";
import { PlayerCard, type PlayerCardData } from "@/components/player-card";
import { PlayerSearchForm } from "@/components/player-search-form";

const PAGE_SIZE = 25;

export const metadata = {
  title: "Players",
};

// Cross-guild player discovery, scoped to the viewer's own Server #.
// Anyone in a guild can browse; players who set `discoverableForDuels=false`
// are hidden. Sorting prefers recently-active players so the page reflects
// who's actually duelling vs. dormant accounts.
export default async function PlayersPage({
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
  const t = await getTranslations("players");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const powerTier = params.powerTier ?? "";
  const filterGuildId = params.guildId ?? "";

  // Resolve the viewer's server #. Cross-guild discovery is gated on having
  // a Server # set — otherwise we can't compute "same server".
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

  // Same-server guilds — used to populate the filter dropdown and as the
  // visibility scope for the players themselves.
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
  if (sameServerGuildIds.length === 0) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("noGuildsOnServer")}</p>
      </main>
    );
  }

  // Build the WHERE conditions. Drizzle's `and()` takes a varargs list of
  // SQL chunks; we conditionally append filters.
  const conditions = [
    eq(users.discoverableForDuels, true),
    ne(users.id, membership.userId),
    sql`${users.guildId} IN (${sql.join(
      sameServerGuildIds.map((id) => sql`${id}`),
      sql.raw(", ")
    )})`,
    sql`${users.inGameName} IS NOT NULL AND TRIM(${users.inGameName}) != ''`,
  ];
  if (powerTier) {
    conditions.push(eq(users.powerTier, powerTier as "I"));
  }
  if (filterGuildId && sameServerGuildIds.includes(filterGuildId)) {
    conditions.push(eq(users.guildId, filterGuildId));
  }
  if (q) {
    conditions.push(
      sql`LOWER(${users.inGameName}) LIKE ${"%" + q.toLowerCase() + "%"}`
    );
  }
  const where = and(...conditions);

  // Two queries: count for pagination, page rows for display. Both share
  // the same WHERE clause.
  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(where)
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
    .where(where)
    .orderBy(
      // Recent duelers first; null lastDuelAt sorts last (SQLite quirk: we
      // emit explicit ordering on the IS NULL flag).
      sql`${users.lastDuelAt} IS NULL`,
      desc(users.lastDuelAt),
      asc(users.inGameName)
    )
    .limit(PAGE_SIZE)
    .offset(offset);

  const cards: PlayerCardData[] = rows.map((r) => ({
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
  }));

  // Build pagination URLs that preserve current filters.
  function pageHref(p: number): string {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (powerTier) qs.set("powerTier", powerTier);
    if (filterGuildId) qs.set("guildId", filterGuildId);
    if (p > 1) qs.set("page", String(p));
    return `/players${qs.toString() ? `?${qs.toString()}` : ""}`;
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
          How duels work →
        </Link>
      </p>

      <div className="mb-4">
        <PlayerSearchForm
          guildOptions={sameServerGuilds.map((g) => ({ id: g.id, name: g.name }))}
          defaultQ={q}
          defaultPowerTier={powerTier}
          defaultGuildId={filterGuildId}
        />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          {q || powerTier || filterGuildId
            ? t("noMatches")
            : t("emptyState")}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              sameGuild={
                rows.find((r) => r.id === player.id)?.guildId ===
                membership.guildId
              }
            />
          ))}
        </div>
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
