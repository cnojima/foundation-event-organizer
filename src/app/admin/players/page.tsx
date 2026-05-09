import { db } from "@/db";
import { events, signups, users } from "@/db/schema";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { DateTime } from "@/components/date-time";

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
  return (
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
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const styles: Record<string, string> = {
    leader: "bg-amber-50 text-amber-700 border-amber-200",
    player: "bg-emerald-50 text-emerald-700 border-emerald-200",
    backup: "bg-sky-50 text-sky-700 border-sky-200",
    waitlist: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${
        styles[role] ?? "bg-gray-50 text-gray-700 border-gray-200"
      }`}
    >
      {role}
    </span>
  );
}

export default async function PlayersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  if (!(await isAdmin(session.user.id))) redirect("/");

  const allUsers = await db.select().from(users).orderBy(users.name);

  const allSignups = await db
    .select({ signup: signups, event: events })
    .from(signups)
    .leftJoin(events, eq(signups.eventId, events.id))
    .orderBy(desc(signups.createdAt));

  const signupsByUser = new Map<string, SignupWithEvent[]>();
  for (const row of allSignups) {
    const list = signupsByUser.get(row.signup.userId) ?? [];
    list.push(row);
    signupsByUser.set(row.signup.userId, list);
  }

  const playersWithSignups = allUsers.filter((u) => signupsByUser.has(u.id));
  const totalSignups = allSignups.length;
  const leadershipRequests = allSignups.filter((r) => r.signup.requestLeadership).length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Players</h1>
          <p className="mt-1 text-sm text-gray-500">
            {playersWithSignups.length} of {allUsers.length} registered users have signed up for events.
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Total Players" value={allUsers.length} />
        <Stat label="Total Signups" value={totalSignups} />
        <Stat label="Leadership Requests" value={leadershipRequests} />
      </div>

      {allUsers.length === 0 ? (
        <p className="text-sm text-gray-500">No registered users yet.</p>
      ) : (
        <div className="space-y-4">
          {allUsers.map((user) => {
            const userSignups = signupsByUser.get(user.id) ?? [];
            return <PlayerCard key={user.id} user={user} signups={userSignups} />;
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
}: {
  user: typeof users.$inferSelect;
  signups: SignupWithEvent[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName(user)} email={user.email} image={user.image} />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{displayName(user)}</span>
              {user.isAdmin && (
                <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Admin
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {user.inGameName && user.name && user.inGameName !== user.name
                ? `${user.name} · ${user.email ?? ""}`
                : user.email ?? "no email"}
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
                      href={`/admin/event/${event.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-violet-700"
                    >
                      {event.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-gray-400 italic">
                      Deleted event
                    </span>
                  )}
                  {event?.gameTime && (
                    <div className="text-xs text-gray-500">
                      <DateTime iso={event.gameTime} showUTC={false} />
                    </div>
                  )}
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
                    <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      Backup OK
                    </span>
                  )}
                  {signup.requestLeadership && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Leadership
                    </span>
                  )}
                  {signup.assignedSquad && (
                    <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                      Assigned: Squad {signup.assignedSquad}
                    </span>
                  )}
                  <RoleBadge role={signup.assignedRole} />
                  {signup.attended === true && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Attended
                    </span>
                  )}
                  {signup.attended === false && (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      No-show
                    </span>
                  )}
                  {signup.rating != null && (
                    <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      ★ {signup.rating}
                    </span>
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
