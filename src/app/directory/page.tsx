import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireAnyGuildPage } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { PlayerDirectorySearchForm } from "@/components/player-directory-search-form";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";

const PAGE_SIZE = 25;

export const metadata = {
  title: "Player Directory",
};

// Site-wide roster: every user, regardless of server/guild/discoverability.
// Unlike /players (duel discovery), this ignores `discoverableForDuels` and
// includes guildless users and unclaimed admin-created stubs — it's a
// directory, not a matchmaking surface.
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    server?: string;
    guildId?: string;
  }>;
}) {
  const session = await auth();
  requireAnyGuildPage(session);
  const t = await getTranslations("directory");
  const tHeader = await getTranslations("pageHeader.kicker");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = (params.q ?? "").trim();
  const serverFilter = params.server ?? "";
  const filterGuildId = params.guildId ?? "";

  // All non-deleted guilds — this page isn't scoped to a single server, so
  // (unlike /players) the guild dropdown must span every server.
  const guildRows = await db
    .select({ id: guilds.id, name: guilds.name, tag: guilds.tag, serverNumber: guilds.serverNumber })
    .from(guilds)
    .where(isNull(guilds.deletedAt))
    .orderBy(asc(guilds.name));

  const serverOptions = Array.from(
    new Set(guildRows.map((g) => g.serverNumber).filter((n): n is number => n != null))
  ).sort((a, b) => a - b);

  const conditions = [];
  if (serverFilter) {
    const serverNum = Number(serverFilter);
    if (!Number.isNaN(serverNum)) conditions.push(eq(guilds.serverNumber, serverNum));
  }
  if (filterGuildId) {
    conditions.push(eq(users.guildId, filterGuildId));
  }
  if (q) {
    conditions.push(sql`LOWER(${users.inGameName}) LIKE ${"%" + q.toLowerCase() + "%"}`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .leftJoin(guilds, eq(users.guildId, guilds.id))
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
      stubCreatedAt: users.stubCreatedAt,
      guildId: users.guildId,
      guildName: guilds.name,
      guildTag: guilds.tag,
      serverNumber: guilds.serverNumber,
    })
    .from(users)
    .leftJoin(guilds, eq(users.guildId, guilds.id))
    .where(where)
    // Nulls (players without an in-game name yet) sort last.
    .orderBy(sql`${users.inGameName} IS NULL`, asc(users.inGameName))
    .limit(PAGE_SIZE)
    .offset(offset);

  function pageHref(p: number): string {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (serverFilter) qs.set("server", serverFilter);
    if (filterGuildId) qs.set("guildId", filterGuildId);
    if (p > 1) qs.set("page", String(p));
    return `/directory${qs.toString() ? `?${qs.toString()}` : ""}`;
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader
        kicker={tHeader("directory")}
        title={t("title")}
        subtitle={t("subtitle", { count: total })}
      />

      <div className="mb-4">
        <PlayerDirectorySearchForm
          serverOptions={serverOptions}
          guildOptions={guildRows.map((g) => ({ id: g.id, name: g.name }))}
          defaultQ={q}
          defaultServer={serverFilter}
          defaultGuildId={filterGuildId}
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          {q || serverFilter || filterGuildId ? t("noMatches") : t("emptyState")}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={displayName(r, r.guildTag)} image={r.image} />
                <div className="leading-tight">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {displayName(r, r.guildTag)}
                    </span>
                    {r.stubCreatedAt && (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                        {t("unclaimedBadge")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {r.guildName ? r.guildName : t("noGuild")}
                    {r.serverNumber != null && ` · ${t("serverLabel", { serverNumber: r.serverNumber })}`}
                  </div>
                </div>
              </div>
            </div>
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
