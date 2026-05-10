import { db } from "@/db";
import { events, signups, users, guilds } from "@/db/schema";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { desc, eq, isNull, and } from "drizzle-orm";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";
import { InfoTip } from "@/components/info-tip";

type SignupWithEvent = {
  signup: typeof signups.$inferSelect;
  event: typeof events.$inferSelect | null;
};

function preferenceLabel(pref: number | null): string {
  if (pref === 1) return "1st";
  if (pref === 2) return "2nd";
  return "—";
}

function PreferencePill({ label, pref }: { label: string; pref: number | null }) {
  const has = pref === 1 || pref === 2;
  const tooltip =
    pref === 1
      ? `${label} is the player's first choice.`
      : pref === 2
        ? `${label} is the player's second choice.`
        : `Player has no preference for ${label}.`;
  return (
    <InfoTip content={tooltip}>
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
          has
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-gray-200 bg-gray-50 text-gray-400"
        }`}
      >
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <span>{preferenceLabel(pref)}</span>
      </span>
    </InfoTip>
  );
}

const ROLE_TOOLTIPS: Record<string, string> = {
  leader: "Assigned to lead the squad during the match.",
  player: "On the starting roster for the squad.",
  backup: "On the backup roster — plays only if a starter drops.",
  waitlist: "All slots were full at signup. Promoted only if a slot opens.",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const styles: Record<string, string> = {
    leader: "bg-amber-50 text-amber-700 border-amber-200",
    player: "bg-emerald-50 text-emerald-700 border-emerald-200",
    backup: "bg-sky-50 text-sky-700 border-sky-200",
    waitlist: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <InfoTip content={ROLE_TOOLTIPS[role] ?? `Assigned role: ${role}`}>
      <span
        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${
          styles[role] ?? "bg-gray-50 text-gray-700 border-gray-200"
        }`}
      >
        {role}
      </span>
    </InfoTip>
  );
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
        <p className="text-red-600">Guild not found.</p>
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

  return (
    <div className="mx-auto max-w-6xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {actingGuild ? `${actingGuild.name} — Players` : "Players"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {playersWithSignups.length} of {guildUsers.length} guild members have signed up for events.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Total Players" value={guildUsers.length} />
        <Stat label="Total Signups" value={totalSignups} />
        <Stat label="Leadership Requests" value={leadershipRequests} />
      </div>

      {guildUsers.length === 0 ? (
        <p className="text-sm text-gray-500">No guild members yet.</p>
      ) : (
        <div className="space-y-4">
          {guildUsers.map((user) => {
            const userSignups = signupsByUser.get(user.id) ?? [];
            return (
              <PlayerCard
                key={user.id}
                user={user}
                signups={userSignups}
                isImpersonating={isImpersonating}
                guildIdQuery={isImpersonating ? targetGuildId : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

function PlayerCard({
  user,
  signups: userSignups,
  guildIdQuery,
}: {
  user: typeof users.$inferSelect;
  signups: SignupWithEvent[];
  isImpersonating: boolean;
  guildIdQuery?: string;
}) {
  const linkSuffix = guildIdQuery ? `?guildId=${guildIdQuery}` : "";
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName(user)} image={user.image} />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{displayName(user)}</span>
              {user.guildRole === "admin" && (
                <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Admin
                </span>
              )}
              {user.isSuperAdmin && (
                <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Super
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {userSignups.length} signup{userSignups.length === 1 ? "" : "s"}
        </div>
      </div>

      {userSignups.length === 0 ? (
        <div className="px-5 py-4 text-sm text-gray-500">No signups yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {userSignups.map(({ signup, event }) => (
            <li key={signup.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {event ? (
                    <Link
                      href={`/admin/event/${event.id}${linkSuffix}`}
                      className="text-sm font-semibold text-gray-900 hover:text-violet-700"
                    >
                      {event.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-gray-400 italic">
                      Deleted event
                    </span>
                  )}
                  {event && (() => {
                    // Pick the timestamp most relevant to this signup: their
                    // assigned squad's start time → first-choice squad → any
                    // available time → nothing.
                    const assigned =
                      signup.assignedSquad === 1
                        ? event.squad1StartsAt
                        : signup.assignedSquad === 2
                          ? event.squad2StartsAt
                          : null;
                    const firstChoice =
                      signup.squad1Preference === 1
                        ? event.squad1StartsAt
                        : signup.squad2Preference === 1
                          ? event.squad2StartsAt
                          : null;
                    const fallback =
                      event.kind === "simple"
                        ? event.gameTime
                        : event.squad1StartsAt ?? event.squad2StartsAt;
                    const iso = assigned ?? firstChoice ?? fallback;
                    if (!iso) return null;
                    return (
                      <div className="text-xs text-gray-500">
                        <DateTime iso={iso} showUTC={false} />
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <PreferencePill
                    label={event?.squad1Name ?? "Squad 1"}
                    pref={signup.squad1Preference}
                  />
                  <PreferencePill
                    label={event?.squad2Name ?? "Squad 2"}
                    pref={signup.squad2Preference}
                  />
                  {signup.willingBackup && (
                    <InfoTip content="Player accepted being a backup if the main roster fills up.">
                      <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                        Backup OK
                      </span>
                    </InfoTip>
                  )}
                  {signup.requestLeadership && (
                    <InfoTip content="Player asked to be considered for a leader spot.">
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Leadership
                      </span>
                    </InfoTip>
                  )}
                  {signup.assignedSquad && (
                    <InfoTip content={`Admin manually assigned this player to Squad ${signup.assignedSquad}.`}>
                      <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                        Assigned: Squad {signup.assignedSquad}
                      </span>
                    </InfoTip>
                  )}
                  <RoleBadge role={signup.assignedRole} />
                  {signup.attended === true && (
                    <InfoTip content="Admin marked this player as showing up for the match.">
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Attended
                      </span>
                    </InfoTip>
                  )}
                  {signup.attended === false && (
                    <InfoTip content="Admin marked this player as a no-show.">
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        No-show
                      </span>
                    </InfoTip>
                  )}
                  {signup.rating != null && (
                    <InfoTip content={`Admin rating: ${signup.rating} of 5.`}>
                      <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        ★ {signup.rating}
                      </span>
                    </InfoTip>
                  )}
                </div>
              </div>
              {signup.leadershipNote && (
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-semibold">Leadership note: </span>
                  {signup.leadershipNote}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
