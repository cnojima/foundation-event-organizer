import { db } from "@/db";
import { guildInvites, guilds, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { isInviteUsable } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function JoinByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/join/${code}`)}`);
  }

  const invite = await db.query.guildInvites.findFirst({
    where: eq(guildInvites.code, code),
  });

  if (!invite || !isInviteUsable(invite)) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Invite invalid
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This invite link has expired, been revoked, or is invalid. Ask your
          guild admin for a new one.
        </p>
      </div>
    );
  }

  const guild = await db.query.guilds.findFirst({
    where: and(eq(guilds.id, invite.guildId), isNull(guilds.deletedAt)),
  });
  if (!guild) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Guild not found
        </h1>
      </div>
    );
  }

  const me = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (me?.guildId === guild.id) {
    redirect("/");
  }

  if (me?.guildId) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Already in a guild
        </h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          You&apos;re a member of another guild. Leave it first, then come back to
          this link to join <strong>{guild.name}</strong>.
        </p>
      </div>
    );
  }

  // Auto-join via the same logic as /api/guilds/join.
  db.transaction((tx) => {
    const fresh = tx
      .select()
      .from(guildInvites)
      .where(eq(guildInvites.id, invite.id))
      .get();
    if (!fresh || !isInviteUsable(fresh)) return;
    tx.update(guildInvites)
      .set({ usesCount: fresh.usesCount + 1 })
      .where(eq(guildInvites.id, invite.id))
      .run();
    tx.update(users)
      .set({ guildId: guild.id, guildRole: "member" })
      .where(eq(users.id, session.user!.id!))
      .run();
  });

  redirect("/");
}
