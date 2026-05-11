import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { duelProposals, guilds, users } from "@/db/schema";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireAnyGuildPage } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { duelSideFor, viewerOutcome } from "@/lib/duels";

const HISTORY_PAGE_SIZE = 25;

export const metadata = {
  title: "Player profile — Foundation Event Organizer",
};

// Public per-player profile: header (avatar/name/guild/tier), stats stripe
// (ELO, W-L-D, reputation, last duel), and paginated duel history.
//
// Visibility rules:
//   - You can always view your own profile.
//   - Super-admins can view anyone.
//   - Otherwise: profile owner must be discoverable AND on the same
//     server as the viewer. Out-of-scope profiles return 404 (rather than
//     redirect) so we don't leak whether the player exists.
export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageStr } = await searchParams;

  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const t = await getTranslations("playerProfile");

  const profile = await db
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
      discoverableForDuels: users.discoverableForDuels,
      guildId: users.guildId,
      guildName: guilds.name,
      guildTag: guilds.tag,
      guildServerNumber: guilds.serverNumber,
    })
    .from(users)
    .leftJoin(guilds, eq(users.guildId, guilds.id))
    .where(eq(users.id, id))
    .get();
  if (!profile) return notFound();

  // Visibility gate.
  const viewerGuild = membership.guildId
    ? await db.query.guilds.findFirst({
        where: eq(guilds.id, membership.guildId),
      })
    : null;
  const viewerServer = viewerGuild?.serverNumber ?? null;
  const isSelf = profile.id === membership.userId;
  const canView =
    isSelf ||
    membership.isSuperAdmin ||
    (profile.discoverableForDuels &&
      viewerServer !== null &&
      profile.guildServerNumber === viewerServer);
  if (!canView) return notFound();

  const name = displayName(
    { inGameName: profile.inGameName },
    profile.guildTag
  );
  const totalDuels =
    profile.duelWins + profile.duelLosses + profile.duelDraws;
  const totalFeedback = profile.feedbackUpCount + profile.feedbackDownCount;
  const reputationPct =
    totalFeedback >= 5
      ? Math.round((profile.feedbackUpCount / totalFeedback) * 100)
      : null;

  // Paginated duel history — only confirmed/accepted-with-result rows so
  // we don't expose pending or declined proposals to the public.
  const page = Math.max(1, Number(pageStr) || 1);
  const historyConditions = and(
    or(
      eq(duelProposals.proposingUserId, profile.id),
      eq(duelProposals.opposingUserId, profile.id)
    ),
    eq(duelProposals.status, "accepted"),
    isNotNull(duelProposals.result)
  );

  const totalHistoryRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(duelProposals)
    .where(historyConditions)
    .get();
  const totalHistory = Number(totalHistoryRow?.count ?? 0);
  const historyPages = Math.max(1, Math.ceil(totalHistory / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, historyPages);
  const offset = (currentPage - 1) * HISTORY_PAGE_SIZE;

  const historyRows = await db
    .select()
    .from(duelProposals)
    .where(historyConditions)
    .orderBy(desc(duelProposals.proposedGameTime))
    .limit(HISTORY_PAGE_SIZE)
    .offset(offset);

  // Hydrate opponent names + guild tags for the visible history page.
  const opponentIds = Array.from(
    new Set(
      historyRows.map((r) =>
        r.proposingUserId === profile.id ? r.opposingUserId : r.proposingUserId
      )
    )
  );
  const opponents =
    opponentIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            inGameName: users.inGameName,
            guildTag: guilds.tag,
          })
          .from(users)
          .leftJoin(guilds, eq(users.guildId, guilds.id))
          .where(
            sql`${users.id} IN (${sql.join(
              opponentIds.map((oid) => sql`${oid}`),
              sql.raw(", ")
            )})`
          );
  const opponentById = new Map(opponents.map((o) => [o.id, o]));

  const sameGuild =
    !isSelf &&
    profile.guildId !== null &&
    profile.guildId === membership.guildId;
  const canChallenge =
    !isSelf && !sameGuild && profile.discoverableForDuels;

  // Pulled out as a local so TS narrowing carries through `historyHref`'s
  // closure (the `if (!profile) return notFound()` guard above doesn't
  // automatically narrow inside nested functions).
  const profileId = profile.id;
  function historyHref(p: number): string {
    return p > 1 ? `/players/${profileId}?page=${p}` : `/players/${profileId}`;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/players" className="text-sm text-violet-700 hover:underline">
        ← {t("backToPlayers")}
      </Link>

      <header className="mt-2 mb-6 flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <UserAvatar name={name} image={profile.image} size="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {name}
            </h1>
            {profile.powerTier && (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700">
                {profile.powerTier}
              </span>
            )}
            {isSelf && (
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                {t("youBadge")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {profile.guildName ?? t("noGuild")}
            {profile.guildServerNumber
              ? ` · ${t("serverLabel", { serverNumber: profile.guildServerNumber })}`
              : ""}
          </p>
        </div>
        <div className="shrink-0">
          {canChallenge && (
            <Link
              href={`/duels/new?opponent=${profile.id}`}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              {t("challenge")}
            </Link>
          )}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("rating")} value={String(profile.duelRating)} />
        <Stat
          label={t("record")}
          value={`${profile.duelWins}W · ${profile.duelLosses}L${
            profile.duelDraws > 0 ? ` · ${profile.duelDraws}D` : ""
          }`}
          sub={t("duelsTotal", { count: totalDuels })}
        />
        <Stat
          label={t("reputation")}
          value={
            reputationPct !== null
              ? `${reputationPct}%`
              : "—"
          }
          sub={
            reputationPct !== null
              ? t("reputationSub", { count: totalFeedback })
              : t("reputationNotEnough")
          }
        />
        <Stat
          label={t("lastActive")}
          value={
            profile.lastDuelAt ? (
              <DateTime iso={profile.lastDuelAt} mode="date" />
            ) : (
              "—"
            )
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          {t("historyHeading")}
        </h2>
        {historyRows.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            {t("historyEmpty")}
          </p>
        ) : (
          <ol className="space-y-2">
            {historyRows.map((row) => {
              const side = duelSideFor(
                profile.id,
                row.proposingUserId,
                row.opposingUserId
              );
              const opponentId =
                side === "proposing" ? row.opposingUserId : row.proposingUserId;
              const opponent = opponentById.get(opponentId);
              const opponentName = opponent
                ? displayName(opponent, opponent.guildTag)
                : t("unknownPlayer");
              const outcome = viewerOutcome(side, row.result);

              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {outcome && <OutcomeChip outcome={outcome} />}
                    <span className="font-semibold text-gray-900">
                      vs{" "}
                      <Link
                        href={`/players/${opponentId}`}
                        className="text-violet-700 hover:underline"
                      >
                        {opponentName}
                      </Link>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    <span>
                      <DateTime iso={row.proposedGameTime} mode="date" />
                    </span>
                    <span>
                      {t("locationLabel")}: {row.location}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {t("winConditionLabel")}: {row.winCondition}
                  </p>
                  {row.resultNotes && (
                    <p className="mt-1 text-xs italic text-gray-600">
                      &ldquo;{row.resultNotes}&rdquo;
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {historyPages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm">
            <Link
              href={historyHref(Math.max(1, currentPage - 1))}
              className={`rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold ${
                currentPage > 1
                  ? "text-gray-700 hover:bg-gray-50"
                  : "pointer-events-none opacity-40"
              }`}
              aria-disabled={currentPage === 1}
            >
              {t("prev")}
            </Link>
            <span className="text-gray-500">
              {t("pageOf", { page: currentPage, total: historyPages })}
            </span>
            <Link
              href={historyHref(Math.min(historyPages, currentPage + 1))}
              className={`rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold ${
                currentPage < historyPages
                  ? "text-gray-700 hover:bg-gray-50"
                  : "pointer-events-none opacity-40"
              }`}
              aria-disabled={currentPage === historyPages}
            >
              {t("next")}
            </Link>
          </nav>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: "W" | "L" | "D" | "NC" }) {
  const styles: Record<string, string> = {
    W: "border-emerald-200 bg-emerald-50 text-emerald-700",
    L: "border-red-200 bg-red-50 text-red-700",
    D: "border-amber-200 bg-amber-50 text-amber-700",
    NC: "border-gray-200 bg-gray-50 text-gray-600",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[outcome]}`}
    >
      {outcome}
    </span>
  );
}
