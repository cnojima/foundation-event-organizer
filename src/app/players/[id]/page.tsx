import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { duelProposals, events, guilds, signups, users } from "@/db/schema";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireAnyGuildPage } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { duelSideFor, viewerOutcome } from "@/lib/duels";
import { WAITLIST_ROLE } from "@/lib/waitlist";

const RECENT_EVENTS_LIMIT = 10;

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

  // Match-attendance section visibility: same-guild members (and self /
  // super-admin) see signup + attendance aggregates. Cross-guild viewers
  // get only the duel info, matching the issue #9 access matrix. We also
  // need a guildId on the profile to scope the query.
  const canViewAttendance =
    !!profile.guildId &&
    (isSelf ||
      membership.isSuperAdmin ||
      profile.guildId === membership.guildId);

  type AttendanceRow = {
    eventId: string;
    eventName: string;
    squad1Name: string;
    squad2Name: string;
    squad1StartsAt: string | null;
    squad2StartsAt: string | null;
    assignedSquad: number | null;
    assignedRole: string | null;
    attended: boolean | null;
    requestLeadership: boolean | null;
  };
  let attendanceRows: AttendanceRow[] = [];
  if (canViewAttendance && profile.guildId) {
    attendanceRows = await db
      .select({
        eventId: events.id,
        eventName: events.name,
        squad1Name: events.squad1Name,
        squad2Name: events.squad2Name,
        squad1StartsAt: events.squad1StartsAt,
        squad2StartsAt: events.squad2StartsAt,
        assignedSquad: signups.assignedSquad,
        assignedRole: signups.assignedRole,
        attended: signups.attended,
        requestLeadership: signups.requestLeadership,
      })
      .from(signups)
      .innerJoin(events, eq(signups.eventId, events.id))
      .where(
        and(
          eq(signups.userId, profile.id),
          isNull(signups.deletedAt),
          eq(events.kind, "match"),
          eq(events.guildId, profile.guildId)
        )
      )
      // Order by squad1StartsAt — match events leave gameTime null and use
      // squad1StartsAt as the canonical reference time. Unscheduled events
      // (null) sort last via the explicit IS NULL flag.
      .orderBy(
        sql`${events.squad1StartsAt} IS NULL`,
        desc(events.squad1StartsAt),
        desc(events.createdAt)
      );
  }

  const totalSignups = attendanceRows.length;
  // Squad assignment buckets are mutually exclusive: waitlist beats squad
  // (a waitlisted signup may also have a stale assignedSquad). Backup is a
  // role on a squad. Unassigned = no squad and no special role yet.
  const buckets = {
    squad1: 0,
    squad2: 0,
    backup: 0,
    waitlist: 0,
    unassigned: 0,
  };
  for (const row of attendanceRows) {
    if (row.assignedRole === WAITLIST_ROLE) buckets.waitlist += 1;
    else if (row.assignedRole === "backup") buckets.backup += 1;
    else if (row.assignedSquad === 1) buckets.squad1 += 1;
    else if (row.assignedSquad === 2) buckets.squad2 += 1;
    else buckets.unassigned += 1;
  }
  const attendanceRecorded = attendanceRows.filter(
    (r) => r.attended !== null
  ).length;
  const attendedCount = attendanceRows.filter((r) => r.attended === true).length;
  const attendanceRate =
    attendanceRecorded > 0
      ? Math.round((attendedCount / attendanceRecorded) * 100)
      : null;
  const leadershipRequested = attendanceRows.filter(
    (r) => r.requestLeadership === true
  ).length;
  const leadershipFulfilled = attendanceRows.filter(
    (r) => r.requestLeadership === true && r.assignedRole === "leader"
  ).length;
  const recentEvents = attendanceRows.slice(0, RECENT_EVENTS_LIMIT);

  // Pulled out as a local so TS narrowing carries through `historyHref`'s
  // closure (the `if (!profile) return notFound()` guard above doesn't
  // automatically narrow inside nested functions).
  const profileId = profile.id;
  function historyHref(p: number): string {
    return p > 1 ? `/players/${profileId}?page=${p}` : `/players/${profileId}`;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/players" className="text-sm text-violet-700 hover:underline dark:text-violet-300">
        ← {t("backToPlayers")}
      </Link>

      <header className="mt-2 mb-6 flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <UserAvatar name={name} image={profile.image} size="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {name}
            </h1>
            {profile.powerTier && (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                {profile.powerTier}
              </span>
            )}
            {isSelf && (
              <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                {t("youBadge")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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

      {canViewAttendance && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("attendanceHeading")}
          </h2>
          {totalSignups === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              {t("attendanceEmpty")}
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label={t("attendanceTotalSignups")}
                  value={String(totalSignups)}
                  sub={t("attendanceTotalSignupsSub", { count: totalSignups })}
                />
                <Stat
                  label={t("attendanceRate")}
                  value={
                    attendanceRate !== null
                      ? t("attendanceRateValue", { pct: attendanceRate })
                      : t("attendanceRateNoData")
                  }
                  sub={
                    attendanceRate !== null
                      ? t("attendanceRateSub", {
                          attended: attendedCount,
                          recorded: attendanceRecorded,
                        })
                      : t("attendanceRateNoDataSub")
                  }
                />
                <Stat
                  label={t("attendanceLeadership")}
                  value={t("attendanceLeadershipValue", {
                    fulfilled: leadershipFulfilled,
                    requested: leadershipRequested,
                  })}
                  sub={
                    leadershipRequested > 0
                      ? t("attendanceLeadershipSub")
                      : t("attendanceLeadershipNoRequests")
                  }
                />
              </div>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("attendanceBreakdownHeading")}
              </h3>
              <div className="mb-4 flex flex-wrap gap-2">
                <BucketChip
                  label={t("attendanceBucketSquad1")}
                  count={buckets.squad1}
                />
                <BucketChip
                  label={t("attendanceBucketSquad2")}
                  count={buckets.squad2}
                />
                <BucketChip
                  label={t("attendanceBucketBackup")}
                  count={buckets.backup}
                />
                <BucketChip
                  label={t("attendanceBucketWaitlist")}
                  count={buckets.waitlist}
                />
                {buckets.unassigned > 0 && (
                  <BucketChip
                    label={t("attendanceBucketUnassigned")}
                    count={buckets.unassigned}
                  />
                )}
              </div>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("attendanceRecentHeading")}
              </h3>
              <ol className="space-y-2">
                {recentEvents.map((row) => {
                  let assignmentLabel: string;
                  if (row.assignedRole === WAITLIST_ROLE) {
                    assignmentLabel = t("attendanceAssignedWaitlist");
                  } else if (row.assignedRole === "backup") {
                    assignmentLabel = t("attendanceAssignedBackup");
                  } else if (row.assignedSquad === 1 || row.assignedSquad === 2) {
                    const squadName =
                      row.assignedSquad === 1 ? row.squad1Name : row.squad2Name;
                    assignmentLabel =
                      row.assignedRole === "leader"
                        ? t("attendanceAssignedLeader", { squadName })
                        : t("attendanceAssignedSquad", { squadName });
                  } else {
                    assignmentLabel = t("attendanceAssignedUnassigned");
                  }
                  const eventTime =
                    row.assignedSquad === 2
                      ? (row.squad2StartsAt ?? row.squad1StartsAt)
                      : row.squad1StartsAt;
                  // attended: true=showed, false=no-show, null=not recorded yet.
                  let chipLabel: string;
                  let chipStyle: string;
                  if (row.attended === true) {
                    chipLabel = t("attendanceAttended");
                    chipStyle =
                      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
                  } else if (row.attended === false) {
                    chipLabel = t("attendanceMissed");
                    chipStyle =
                      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300";
                  } else {
                    chipLabel = t("attendanceAttendanceUnknown");
                    chipStyle =
                      "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400";
                  }
                  return (
                    <li
                      key={row.eventId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/event/${row.eventId}`}
                          className="truncate font-semibold text-gray-900 hover:text-violet-700 dark:text-gray-100 dark:hover:text-violet-300"
                        >
                          {row.eventName}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                          {eventTime && (
                            <span>
                              <DateTime iso={eventTime} mode="date" />
                            </span>
                          )}
                          <span>{assignmentLabel}</span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${chipStyle}`}
                      >
                        {chipLabel}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("historyHeading")}
        </h2>
        {historyRows.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
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
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {outcome && <OutcomeChip outcome={outcome} />}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      vs{" "}
                      <Link
                        href={`/players/${opponentId}`}
                        className="text-violet-700 hover:underline dark:text-violet-300"
                      >
                        {opponentName}
                      </Link>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      <DateTime iso={row.proposedGameTime} mode="date" />
                    </span>
                    <span>
                      {t("locationLabel")}: {row.location}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {t("winConditionLabel")}: {row.winCondition}
                  </p>
                  {row.resultNotes && (
                    <p className="mt-1 text-xs italic text-gray-600 dark:text-gray-400">
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
              {t("pageOf", { page: currentPage, total: historyPages })}
            </span>
            <Link
              href={historyHref(Math.min(historyPages, currentPage + 1))}
              className={`rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold dark:border-gray-700 dark:bg-gray-900 ${
                currentPage < historyPages
                  ? "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                  : "pointer-events-none opacity-40 dark:text-gray-400"
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function BucketChip({ label, count }: { label: string; count: number }) {
  const active = count > 0;
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${
        active
          ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300"
          : "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
      }`}
    >
      {label}: <span className="font-mono">{count}</span>
    </span>
  );
}

function OutcomeChip({ outcome }: { outcome: "W" | "L" | "D" | "NC" }) {
  const styles: Record<string, string> = {
    W: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    L: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
    D: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    NC: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[outcome]}`}
    >
      {outcome}
    </span>
  );
}
