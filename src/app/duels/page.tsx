import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { duelProposals, guilds, users } from "@/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requireAnyGuildPage } from "@/lib/rbac";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { DuelAction } from "@/components/duel-row-actions";
import { duelSideFor, viewerOutcome } from "@/lib/duels";

export const metadata = {
  title: "Duels — Foundation Event Organizer",
};

type DuelRow = typeof duelProposals.$inferSelect;
type PlayerLite = {
  id: string;
  inGameName: string | null;
  guildTag: string | null;
};

// Player-facing duel dashboard: incoming/outgoing pending, upcoming accepted,
// past (any final state with result), archived (declined/withdrawn/cancelled
// without a result). Same-server constraint is enforced at proposal time, so
// no filtering needed here.
export default async function DuelsPage() {
  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const meUserId = membership.userId;

  const rows = await db
    .select()
    .from(duelProposals)
    .where(
      or(
        eq(duelProposals.proposingUserId, meUserId),
        eq(duelProposals.opposingUserId, meUserId)
      )
    )
    .orderBy(desc(duelProposals.createdAt));

  // Hydrate user names + guild tags once.
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) => [r.proposingUserId, r.opposingUserId])
    )
  );
  const userRows: PlayerLite[] =
    userIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            inGameName: users.inGameName,
            guildTag: guilds.tag,
          })
          .from(users)
          .leftJoin(guilds, eq(users.guildId, guilds.id))
          .where(inArray(users.id, userIds));
  const playerById = new Map(userRows.map((u) => [u.id, u]));

  const incoming = rows.filter(
    (r) => r.status === "pending" && r.opposingUserId === meUserId
  );
  const outgoing = rows.filter(
    (r) => r.status === "pending" && r.proposingUserId === meUserId
  );
  const upcoming = rows.filter((r) => r.status === "accepted" && !r.result);
  const past = rows.filter((r) => r.status === "accepted" && !!r.result);
  const archived = rows.filter((r) =>
    ["declined", "withdrawn", "cancelled"].includes(r.status)
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Duels
        </h1>
        <Link
          href="/players"
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          + Find a player to challenge
        </Link>
      </div>
      <p className="mb-6 text-xs">
        <Link href="/help#duels" className="text-violet-700 hover:underline">
          How duels work →
        </Link>
      </p>

      <Section
        title="Incoming challenges"
        emptyMessage="No pending challenges from other players."
        rows={incoming}
        meUserId={meUserId}
        playerById={playerById}
        bucket="incoming"
      />

      <Section
        title="Outgoing challenges"
        emptyMessage="No challenges waiting on a reply."
        rows={outgoing}
        meUserId={meUserId}
        playerById={playerById}
        bucket="outgoing"
      />

      <Section
        title="Upcoming duels"
        emptyMessage="No scheduled duels."
        rows={upcoming}
        meUserId={meUserId}
        playerById={playerById}
        bucket="upcoming"
      />

      <Section
        title="Past duels (results)"
        emptyMessage=""
        rows={past}
        meUserId={meUserId}
        playerById={playerById}
        bucket="past"
        muted
      />

      {archived.length > 0 && (
        <Section
          title="Declined / withdrawn / cancelled"
          emptyMessage=""
          rows={archived}
          meUserId={meUserId}
          playerById={playerById}
          bucket="archived"
          muted
        />
      )}
    </main>
  );
}

type Bucket = "incoming" | "outgoing" | "upcoming" | "past" | "archived";

function Section({
  title,
  emptyMessage,
  rows,
  meUserId,
  playerById,
  bucket,
  muted = false,
}: {
  title: string;
  emptyMessage: string;
  rows: DuelRow[];
  meUserId: string;
  playerById: Map<string, PlayerLite>;
  bucket: Bucket;
  muted?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2
        className={`mb-3 text-lg font-semibold ${muted ? "text-gray-500" : "text-gray-900"}`}
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        emptyMessage ? (
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        ) : null
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <DuelCard
              key={row.id}
              row={row}
              meUserId={meUserId}
              playerById={playerById}
              bucket={bucket}
              muted={muted}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DuelCard({
  row,
  meUserId,
  playerById,
  bucket,
  muted,
}: {
  row: DuelRow;
  meUserId: string;
  playerById: Map<string, PlayerLite>;
  bucket: Bucket;
  muted: boolean;
}) {
  const side = duelSideFor(meUserId, row.proposingUserId, row.opposingUserId);
  const opponentId =
    side === "proposing" ? row.opposingUserId : row.proposingUserId;
  const opponent = playerById.get(opponentId);
  const opponentLabel = opponent
    ? displayName(opponent, opponent.guildTag)
    : "Unknown player";
  const outcome = viewerOutcome(side, row.result);

  return (
    <div
      className={`rounded-lg border bg-white p-4 ${muted ? "border-gray-200 opacity-80" : "border-gray-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">vs {opponentLabel}</span>
            <StatusChip status={row.status} outcome={outcome} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
            <span>
              <DateTime iso={row.proposedGameTime} showUTC={false} />
            </span>
            <span>Location: {row.location}</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">
            <span className="font-semibold">Win:</span> {row.winCondition}
          </p>
          {row.message && (
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">
              {row.message}
            </p>
          )}
          {row.resultNotes && (
            <p className="mt-1 text-xs text-gray-600 italic">
              &ldquo;{row.resultNotes}&rdquo;
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-end gap-2">
          {bucket === "incoming" && (
            <>
              <DuelAction duelId={row.id} action="accept" />
              <DuelAction duelId={row.id} action="decline" />
            </>
          )}
          {bucket === "outgoing" && (
            <DuelAction duelId={row.id} action="withdraw" />
          )}
          {bucket === "upcoming" && !row.result && (
            <Link
              href={`/duels/${row.id}`}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              Declare result
            </Link>
          )}
          {/* Pending rows: an explicit "Counter-propose" link to the detail
              page where the edit form lives. Without this, an opposer who
              wants to negotiate terms has no obvious path off the dashboard. */}
          {(bucket === "incoming" || bucket === "outgoing") && (
            <Link
              href={`/duels/${row.id}`}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Counter-propose
            </Link>
          )}
          {(bucket === "past" || bucket === "upcoming") && (
            <Link
              href={`/duels/${row.id}`}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Open
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  status,
  outcome,
}: {
  status: DuelRow["status"];
  outcome: ReturnType<typeof viewerOutcome>;
}) {
  if (status === "accepted" && outcome) {
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
  const styles: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    accepted: "border-violet-200 bg-violet-50 text-violet-700",
    declined: "border-gray-200 bg-gray-50 text-gray-600",
    withdrawn: "border-gray-200 bg-gray-50 text-gray-600",
    cancelled: "border-gray-200 bg-gray-50 text-gray-600",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}
