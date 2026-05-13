import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { duelProposals, guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSignedInPage } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { DuelAction } from "@/components/duel-row-actions";
import { DuelResultForm } from "@/components/duel-result-form";
import { DuelFeedbackForm } from "@/components/duel-feedback-form";
import { DuelEditToggle } from "@/components/duel-edit-toggle";
import { duelSideFor, viewerOutcome } from "@/lib/duels";
import { displayName } from "@/lib/display";
import { UserAvatar } from "@/components/user-avatar";
import { CalendarDownloadLink } from "@/components/calendar-download-link";

export const metadata = {
  title: "Duel — Foundation Event Organizer",
};

// Duel detail page — accessible to either participant (and super-admins).
// Renders the matchup header, lifecycle controls appropriate to the
// current status, and the result/feedback forms once the duel is accepted.
export default async function DuelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const membership = requireSignedInPage(session);

  const duel = await db.query.duelProposals.findFirst({
    where: eq(duelProposals.id, id),
  });
  if (!duel) return notFound();

  const involved =
    membership.isSuperAdmin ||
    duel.proposingUserId === membership.userId ||
    duel.opposingUserId === membership.userId;
  if (!involved) {
    // Privacy: only the two players (and super-admins) see the detail page.
    redirect("/duels");
  }

  const [proposing, opposing] = await Promise.all([
    loadPlayer(duel.proposingUserId),
    loadPlayer(duel.opposingUserId),
  ]);

  const side = duelSideFor(
    membership.userId,
    duel.proposingUserId,
    duel.opposingUserId
  );
  const outcome = viewerOutcome(side, duel.result);
  const isProposer = duel.proposingUserId === membership.userId;
  const isOpposer = duel.opposingUserId === membership.userId;
  const isParticipant = isProposer || isOpposer;

  // Bidirectional edit + accept gating. Whoever most recently set the
  // terms can't accept their own; the OTHER side has to confirm. Null
  // lastEditedByUserId means no edits yet, so the proposer's original
  // offer stands and the opposer is the accepter (the legacy default).
  const effectiveLastEditor =
    duel.lastEditedByUserId ?? duel.proposingUserId;
  const canAccept =
    duel.status === "pending" &&
    isParticipant &&
    membership.userId !== effectiveLastEditor;
  const canEdit = duel.status === "pending" && isParticipant;

  const canDeclareResult = duel.status === "accepted" && !duel.result && (isProposer || isOpposer);
  const hasResult = !!duel.result;
  const myExistingFeedback = isProposer
    ? duel.proposingFeedback
    : isOpposer
      ? duel.opposingFeedback
      : null;
  const canLeaveFeedback = hasResult && (isProposer || isOpposer);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/duels" className="text-sm text-violet-700 hover:underline dark:text-violet-300">
        ← Back to duels
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Duel
        </h1>
        <Link
          href="/help#duels"
          className="text-xs text-violet-700 hover:underline dark:text-violet-300"
        >
          How duels work →
        </Link>
      </div>
      <StatusBanner status={duel.status} outcome={outcome} />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlayerPanel
          label="Proposer"
          player={proposing}
          ratingDelta={null}
          isYou={isProposer}
        />
        <PlayerPanel
          label="Opponent"
          player={opposing}
          ratingDelta={null}
          isYou={isOpposer}
        />
      </div>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-gray-900">
        <p>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Time:</span>{" "}
          <DateTime iso={duel.proposedGameTime} />
        </p>
        <p className="mt-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Location:</span>{" "}
          {duel.location}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100">Condition of Win:</span>{" "}
          {duel.winCondition}
        </p>
        {duel.message && (
          <p className="mt-2 text-gray-600 whitespace-pre-line dark:text-gray-400">{duel.message}</p>
        )}
        {duel.resultNotes && (
          <p className="mt-2 text-xs text-gray-600 italic dark:text-gray-400">
            Result notes: &ldquo;{duel.resultNotes}&rdquo;
          </p>
        )}
        {/* Calendar download — only for accepted duels still in the
            future. Past/cancelled/declined duels skip the button since
            the calendar entry isn't useful then. */}
        {duel.status === "accepted" && !duel.result && (
          <div className="mt-3">
            <CalendarDownloadLink href={`/api/duels/${duel.id}/ics`} />
          </div>
        )}
      </section>

      {duel.status === "pending" && (
        <section className="mt-6 flex flex-wrap gap-2">
          {canAccept && <DuelAction duelId={duel.id} action="accept" />}
          {isOpposer && <DuelAction duelId={duel.id} action="decline" />}
          {isProposer && (
            <DuelAction duelId={duel.id} action="withdraw" />
          )}
        </section>
      )}

      {canEdit && (
        <section className="mt-4">
          <DuelEditToggle
            duelId={duel.id}
            defaultGameTimeUtc={duel.proposedGameTime}
            defaultLocation={duel.location}
            defaultWinCondition={duel.winCondition}
            defaultMessage={duel.message}
          />
          {!canAccept && duel.lastEditedByUserId === membership.userId && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              You set the latest terms — waiting on the other player to
              accept (or counter-edit).
            </p>
          )}
        </section>
      )}

      {duel.status === "accepted" && !duel.result && (isProposer || isOpposer) && (
        <section className="mt-6">
          <DuelAction duelId={duel.id} action="cancel" />
        </section>
      )}

      {canDeclareResult && (
        <section className="mt-6">
          <DuelResultForm duelId={duel.id} />
        </section>
      )}

      {canLeaveFeedback && (
        <section className="mt-6">
          <DuelFeedbackForm
            duelId={duel.id}
            existing={myExistingFeedback ?? null}
          />
        </section>
      )}
    </main>
  );
}

type Player = {
  id: string;
  inGameName: string | null;
  image: string | null;
  duelRating: number;
  powerTier: string | null;
  guildName: string | null;
  guildTag: string | null;
} | null;

async function loadPlayer(userId: string): Promise<Player> {
  const row = await db
    .select({
      id: users.id,
      inGameName: users.inGameName,
      image: users.image,
      duelRating: users.duelRating,
      powerTier: users.powerTier,
      guildName: guilds.name,
      guildTag: guilds.tag,
    })
    .from(users)
    .leftJoin(guilds, eq(users.guildId, guilds.id))
    .where(eq(users.id, userId))
    .get();
  return row ?? null;
}

function PlayerPanel({
  label,
  player,
  ratingDelta: _ratingDelta,
  isYou,
}: {
  label: string;
  player: Player;
  ratingDelta: number | null;
  isYou: boolean;
}) {
  if (!player) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        {label}: player deleted
      </div>
    );
  }
  const name = displayName(
    { inGameName: player.inGameName },
    player.guildTag
  );
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
        {isYou && <span className="ml-1 text-violet-600 dark:text-violet-300">(you)</span>}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <UserAvatar
          name={name}
          image={player.image}
          size="size-10"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {player.guildName ?? "—"}
            {player.powerTier && ` · Tier ${player.powerTier}`}
            {` · ${player.duelRating} rating`}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  outcome,
}: {
  status: typeof duelProposals.$inferSelect.status;
  outcome: ReturnType<typeof viewerOutcome>;
}) {
  if (status === "accepted" && outcome) {
    const styles: Record<string, string> = {
      W: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
      L: "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
      D: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
      NC: "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
    };
    const labels: Record<string, string> = {
      W: "You won",
      L: "You lost",
      D: "Draw",
      NC: "No contest",
    };
    return (
      <p
        className={`mt-2 inline-block rounded border px-2 py-1 text-xs font-bold uppercase tracking-wider ${styles[outcome]}`}
      >
        Result: {labels[outcome]}
      </p>
    );
  }
  const statusStyles: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    accepted: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300",
    declined: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
    withdrawn: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
    cancelled: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400",
  };
  return (
    <p
      className={`mt-2 inline-block rounded border px-2 py-1 text-xs font-bold uppercase tracking-wider ${statusStyles[status]}`}
    >
      {status}
    </p>
  );
}
