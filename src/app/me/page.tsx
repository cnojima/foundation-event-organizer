import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSignedInPage } from "@/lib/rbac";
import { InGameNameForm } from "@/components/in-game-name-form";
import { LeaveGuildButton } from "@/components/leave-guild-button";
import { DeleteAccountButton } from "@/components/delete-account-button";

export const metadata = {
  title: "My Account — Foundation Event Organizer",
};

export default async function MePage() {
  const session = await auth();
  const membership = requireSignedInPage(session);

  const me = await db.query.users.findFirst({
    where: eq(users.id, membership.userId),
  });
  if (!me) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-red-600">Account not found.</p>
      </div>
    );
  }

  const guild = membership.guildId
    ? await db.query.guilds.findFirst({
        where: eq(guilds.id, membership.guildId),
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          My Account
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Update your in-game name, leave your guild, or delete your account.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">In-game name</h2>
        <InGameNameForm defaultValue={me.inGameName ?? ""} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Guild membership</h2>
        {guild ? (
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-700">
              You&apos;re a {membership.guildRole === "admin" ? "guild admin" : "member"}{" "}
              of <strong>{guild.name}</strong>.
            </p>
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="mb-3 text-sm text-red-800">
                Leaving this guild removes you from its events and soft-deletes
                your past signups (kept for the guild&apos;s attendance reports).
                {membership.guildRole === "admin" &&
                  " Because you're an admin, you can only leave if there's another admin remaining."}
              </p>
              <LeaveGuildButton />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-700">
            You&apos;re not in a guild.{" "}
            <a className="font-semibold text-violet-700 underline" href="/guilds">
              Browse guilds
            </a>{" "}
            to find one to join.
          </div>
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-red-700">
          Danger zone
        </h2>
        <p className="mb-3 text-sm text-red-800">
          Deleting your account permanently removes your user record, all your
          signups, and unlinks any Google/Discord accounts. You won&apos;t be
          able to recover this — sign in again would create a new, empty
          account.
        </p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
