import { db } from "@/db";
import { events, signups, users, guilds } from "@/db/schema";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { desc, eq, isNull, and } from "drizzle-orm";
import { PlayerKindSection, type PlayerKindRow } from "./player-kind-section";

type SignupWithEvent = {
  signup: typeof signups.$inferSelect;
  event: typeof events.$inferSelect | null;
};

type EventKind = "match" | "scrim" | "simple";

const KIND_TITLES: Record<EventKind, string> = {
  match: "Match Events",
  scrim: "Scrim Events",
  simple: "Simple Events",
};

function rowsForKind(
  guildUsers: (typeof users.$inferSelect)[],
  signupsByUser: Map<string, SignupWithEvent[]>,
  kind: EventKind
): PlayerKindRow[] {
  const rows: PlayerKindRow[] = [];
  for (const user of guildUsers) {
    const userSignups = (signupsByUser.get(user.id) ?? []).filter((r) => r.event?.kind === kind);
    if (userSignups.length > 0) rows.push({ user, signups: userSignups });
  }
  rows.sort((a, b) => {
    const attendedA = a.signups.filter((r) => r.signup.attended === true).length;
    const attendedB = b.signups.filter((r) => r.signup.attended === true).length;
    if (attendedB !== attendedA) return attendedB - attendedA;
    if (b.signups.length !== a.signups.length) return b.signups.length - a.signups.length;
    return (a.user.name ?? "").localeCompare(b.user.name ?? "");
  });
  return rows;
}

export default async function PlayersPage({
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
      <div className="mx-auto max-w-6xl">
        <p className="text-red-600 dark:text-red-300">Guild not found.</p>
      </div>
    );
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  const guildUsers = await db
    .select()
    .from(users)
    .where(eq(users.guildId, targetGuildId))
    .orderBy(users.name);

  const guildSignups = await db
    .select({ signup: signups, event: events })
    .from(signups)
    .leftJoin(events, eq(signups.eventId, events.id))
    .where(and(eq(events.guildId, targetGuildId), isNull(signups.deletedAt)))
    .orderBy(desc(signups.createdAt));

  const signupsByUser = new Map<string, SignupWithEvent[]>();
  for (const row of guildSignups) {
    const list = signupsByUser.get(row.signup.userId) ?? [];
    list.push(row);
    signupsByUser.set(row.signup.userId, list);
  }

  const playersWithSignups = guildUsers.filter((u) => signupsByUser.has(u.id));
  const totalSignups = guildSignups.length;
  const leadershipRequests = guildSignups.filter((r) => r.signup.requestLeadership).length;

  const guildIdQuery = isImpersonating ? targetGuildId : undefined;
  const guildTag = actingGuild?.tag ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {actingGuild ? `${actingGuild.name} — Players` : "Players"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {playersWithSignups.length} of {guildUsers.length} guild members have signed up for events. Click a
            player to see their individual signups.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Total Players" value={guildUsers.length} />
        <Stat label="Total Signups" value={totalSignups} />
        <Stat label="Leadership Requests" value={leadershipRequests} />
      </div>

      {guildUsers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No guild members yet.</p>
      ) : playersWithSignups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No signups yet.</p>
      ) : (
        (["match", "scrim", "simple"] as EventKind[]).map((kind) => (
          <PlayerKindSection
            key={kind}
            title={KIND_TITLES[kind]}
            rows={rowsForKind(guildUsers, signupsByUser, kind)}
            guildIdQuery={guildIdQuery}
            guildTag={guildTag}
          />
        ))
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
