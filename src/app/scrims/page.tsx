import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, scrimProposals } from "@/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requireAnyGuildPage } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { scrimSideFor, viewerOutcome } from "@/lib/scrims";

// Player-facing scrim history for the viewer's guild. Read-only — admins
// manage proposals at /admin/scrimmages. Shows accepted/past scrims with
// results from the viewer's perspective.
export default async function ScrimHistoryPage() {
  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const guildId = membership.guildId!;

  const rows = await db
    .select()
    .from(scrimProposals)
    .where(
      or(
        eq(scrimProposals.proposingGuildId, guildId),
        eq(scrimProposals.opposingGuildId, guildId)
      )
    )
    .orderBy(desc(scrimProposals.proposedGameTime));

  const guildIds = Array.from(
    new Set(rows.flatMap((r) => [r.proposingGuildId, r.opposingGuildId]))
  );
  const guildRows =
    guildIds.length > 0
      ? await db
          .select({ id: guilds.id, name: guilds.name, tag: guilds.tag })
          .from(guilds)
          .where(inArray(guilds.id, guildIds))
      : [];
  const guildById = new Map(guildRows.map((g) => [g.id, g]));

  // Players only see scrims that actually happened or are upcoming. Hide
  // declined/withdrawn/cancelled — those are admin noise.
  const visible = rows.filter((r) => r.status === "accepted");
  const upcoming = visible.filter((r) => !r.result);
  const past = visible.filter((r) => !!r.result);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        Scrimmages
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Guild-vs-guild matches your guild has played or has scheduled.
      </p>

      <Section
        title="Upcoming"
        rows={upcoming}
        viewerGuildId={guildId}
        guildById={guildById}
        emptyMessage="No upcoming scrims."
      />

      <Section
        title="History"
        rows={past}
        viewerGuildId={guildId}
        guildById={guildById}
        emptyMessage="No past scrims yet."
        muted
      />
    </main>
  );
}

type ScrimRow = typeof scrimProposals.$inferSelect;
type GuildLite = { id: string; name: string; tag: string | null };

function Section({
  title,
  rows,
  viewerGuildId,
  guildById,
  emptyMessage,
  muted = false,
}: {
  title: string;
  rows: ScrimRow[];
  viewerGuildId: string;
  guildById: Map<string, GuildLite>;
  emptyMessage: string;
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
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const side = scrimSideFor(
              viewerGuildId,
              row.proposingGuildId,
              row.opposingGuildId
            );
            const opponentId =
              side === "proposing"
                ? row.opposingGuildId
                : row.proposingGuildId;
            const opponent = guildById.get(opponentId);
            const opponentLabel = opponent
              ? opponent.tag
                ? `[${opponent.tag}] ${opponent.name}`
                : opponent.name
              : "Unknown";
            const outcome = viewerOutcome(side, row.result);
            const eventId =
              side === "proposing" ? row.proposingEventId : row.opposingEventId;
            const Card = (
              <div
                className={`rounded-lg border bg-white p-4 transition-colors ${
                  muted
                    ? "border-gray-200 opacity-80 hover:opacity-100"
                    : "border-gray-200 hover:border-violet-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        vs {opponentLabel}
                      </span>
                      {outcome && <OutcomeChip outcome={outcome} />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                      <span>
                        <DateTime
                          iso={row.proposedGameTime}
                          showUTC={false}
                        />
                      </span>
                      <span>Location: {row.location}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      Win: {row.winCondition}
                    </p>
                    {row.resultNotes && (
                      <p className="mt-1 text-xs italic text-gray-600">
                        &ldquo;{row.resultNotes}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
            return eventId ? (
              <Link key={row.id} href={`/event/${eventId}`} className="block">
                {Card}
              </Link>
            ) : (
              <div key={row.id}>{Card}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OutcomeChip({ outcome }: { outcome: "W" | "L" | "D" | "NC" }) {
  const styles: Record<string, string> = {
    W: "border-emerald-200 bg-emerald-50 text-emerald-700",
    L: "border-red-200 bg-red-50 text-red-700",
    D: "border-amber-200 bg-amber-50 text-amber-700",
    NC: "border-gray-200 bg-gray-50 text-gray-600",
  };
  const labels: Record<string, string> = {
    W: "Won",
    L: "Lost",
    D: "Draw",
    NC: "No contest",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[outcome]}`}
    >
      {labels[outcome]}
    </span>
  );
}
