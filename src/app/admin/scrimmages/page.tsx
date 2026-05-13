import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, scrimProposals, users } from "@/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { ScrimAction } from "@/components/scrim-row-actions";
import { scrimSideFor, viewerOutcome } from "@/lib/scrims";

type ScrimRow = typeof scrimProposals.$inferSelect;
type GuildLite = { id: string; name: string; tag: string | null };

export default async function ScrimmagesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p className="text-red-600 dark:text-red-300">Guild not found.</p>
      </main>
    );
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;
  const guildSuffix = isImpersonating ? `?guildId=${targetGuildId}` : "";

  const rows = await db
    .select()
    .from(scrimProposals)
    .where(
      or(
        eq(scrimProposals.proposingGuildId, targetGuildId),
        eq(scrimProposals.opposingGuildId, targetGuildId)
      )
    )
    .orderBy(desc(scrimProposals.createdAt));

  // Hydrate guild names + the (small set of) responder names once.
  const guildIds = Array.from(
    new Set(rows.flatMap((r) => [r.proposingGuildId, r.opposingGuildId]))
  );
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.respondedByUserId, r.resultDeclaredByUserId])
        .filter((x): x is string => !!x)
    )
  );
  const guildRows: GuildLite[] =
    guildIds.length > 0
      ? await db
          .select({ id: guilds.id, name: guilds.name, tag: guilds.tag })
          .from(guilds)
          .where(inArray(guilds.id, guildIds))
      : [];
  const guildById = new Map(guildRows.map((g) => [g.id, g]));

  const userRows =
    userIds.length > 0
      ? await db
          .select({
            id: users.id,
            inGameName: users.inGameName,
            name: users.name,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const incoming = rows.filter(
    (r) => r.status === "pending" && r.opposingGuildId === targetGuildId
  );
  const outgoing = rows.filter(
    (r) => r.status === "pending" && r.proposingGuildId === targetGuildId
  );
  const upcoming = rows.filter((r) => r.status === "accepted" && !r.result);
  const past = rows.filter(
    (r) => r.status === "accepted" && !!r.result
  );
  const archived = rows.filter((r) =>
    ["declined", "withdrawn", "cancelled"].includes(r.status)
  );

  return (
    <main className="max-w-4xl mx-auto p-6">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {actingGuild ? `${actingGuild.name} — Scrimmages` : "Scrimmages"}
        </h1>
        <Link
          href={`/admin/scrimmages/new${guildSuffix}`}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + Propose scrim
        </Link>
      </div>

      <Section
        title="Incoming proposals"
        emptyMessage="No pending invites from other guilds."
        rows={incoming}
        viewerGuildId={targetGuildId}
        guildById={guildById}
        userById={userById}
        guildSuffix={guildSuffix}
        bucket="incoming"
      />

      <Section
        title="Outgoing proposals"
        emptyMessage="No proposals waiting on a reply."
        rows={outgoing}
        viewerGuildId={targetGuildId}
        guildById={guildById}
        userById={userById}
        guildSuffix={guildSuffix}
        bucket="outgoing"
      />

      <Section
        title="Upcoming scrims"
        emptyMessage="No accepted scrims scheduled."
        rows={upcoming}
        viewerGuildId={targetGuildId}
        guildById={guildById}
        userById={userById}
        guildSuffix={guildSuffix}
        bucket="upcoming"
      />

      <Section
        title="Past scrims (results)"
        emptyMessage=""
        rows={past}
        viewerGuildId={targetGuildId}
        guildById={guildById}
        userById={userById}
        guildSuffix={guildSuffix}
        bucket="past"
        muted
      />

      {archived.length > 0 && (
        <Section
          title="Declined / withdrawn / cancelled"
          emptyMessage=""
          rows={archived}
          viewerGuildId={targetGuildId}
          guildById={guildById}
          userById={userById}
          guildSuffix={guildSuffix}
          bucket="archived"
          muted
        />
      )}
    </main>
  );
}

type Bucket =
  | "incoming"
  | "outgoing"
  | "upcoming"
  | "past"
  | "archived";

function Section({
  title,
  emptyMessage,
  rows,
  viewerGuildId,
  guildById,
  userById,
  guildSuffix,
  bucket,
  muted = false,
}: {
  title: string;
  emptyMessage: string;
  rows: ScrimRow[];
  viewerGuildId: string;
  guildById: Map<string, GuildLite>;
  userById: Map<string, { id: string; inGameName: string | null; name: string | null }>;
  guildSuffix: string;
  bucket: Bucket;
  muted?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2
        className={`mb-3 text-lg font-semibold ${
          muted ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        emptyMessage ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        ) : null
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <ScrimCard
              key={row.id}
              row={row}
              viewerGuildId={viewerGuildId}
              guildById={guildById}
              userById={userById}
              guildSuffix={guildSuffix}
              bucket={bucket}
              muted={muted}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ScrimCard({
  row,
  viewerGuildId,
  guildById,
  userById,
  guildSuffix,
  bucket,
  muted,
}: {
  row: ScrimRow;
  viewerGuildId: string;
  guildById: Map<string, GuildLite>;
  userById: Map<string, { id: string; inGameName: string | null; name: string | null }>;
  guildSuffix: string;
  bucket: Bucket;
  muted: boolean;
}) {
  const side = scrimSideFor(viewerGuildId, row.proposingGuildId, row.opposingGuildId);
  const opponentId =
    side === "proposing" ? row.opposingGuildId : row.proposingGuildId;
  const opponent = guildById.get(opponentId);
  const opponentLabel = opponent
    ? opponent.tag
      ? `[${opponent.tag}] ${opponent.name}`
      : opponent.name
    : "Unknown guild";
  const eventId =
    side === "proposing" ? row.proposingEventId : row.opposingEventId;

  const outcome = viewerOutcome(side, row.result);

  return (
    <div
      className={`rounded-lg border bg-white p-4 dark:bg-gray-900 ${
        muted ? "border-gray-200 opacity-80 dark:border-gray-800" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100">vs {opponentLabel}</span>
            <StatusChip status={row.status} outcome={outcome} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
              <DateTime iso={row.proposedGameTime} showUTC={false} />
            </span>
            <span>Location: {row.location}</span>
          </div>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-semibold">Win:</span> {row.winCondition}
          </p>
          {row.message && (
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-line dark:text-gray-400">
              {row.message}
            </p>
          )}
          {row.respondedByUserId && row.respondedAt && (
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
              {row.status === "accepted" ? "Accepted" : "Responded"} by{" "}
              {userLabel(userById.get(row.respondedByUserId))} ·{" "}
              <DateTime iso={row.respondedAt} mode="date" />
            </p>
          )}
          {row.result && row.resultDeclaredAt && (
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Result by{" "}
              {userLabel(
                row.resultDeclaredByUserId
                  ? userById.get(row.resultDeclaredByUserId)
                  : undefined
              )}{" "}
              · <DateTime iso={row.resultDeclaredAt} mode="date" />
            </p>
          )}
          {row.resultNotes && (
            <p className="mt-1 text-xs text-gray-600 italic dark:text-gray-400">
              &ldquo;{row.resultNotes}&rdquo;
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-end gap-2">
          {bucket === "incoming" && (
            <>
              <ScrimAction scrimId={row.id} action="accept" />
              <ScrimAction scrimId={row.id} action="decline" />
            </>
          )}
          {bucket === "outgoing" && (
            <ScrimAction scrimId={row.id} action="withdraw" />
          )}
          {bucket === "upcoming" && (
            <>
              {eventId && (
                <Link
                  href={`/admin/event/${eventId}${guildSuffix}`}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Manage event
                </Link>
              )}
              <ScrimAction scrimId={row.id} action="cancel" />
            </>
          )}
          {bucket === "past" && eventId && (
            <Link
              href={`/admin/event/${eventId}${guildSuffix}`}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Open event
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function userLabel(
  u: { inGameName: string | null; name: string | null } | undefined
): string {
  if (!u) return "—";
  return u.inGameName ?? u.name ?? "—";
}

function StatusChip({
  status,
  outcome,
}: {
  status: ScrimRow["status"];
  outcome: ReturnType<typeof viewerOutcome>;
}) {
  if (status === "accepted" && outcome) {
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
  const styles: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    accepted: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300",
    declined: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
    withdrawn: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
    cancelled: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}
