import { db } from "@/db";
import { guildInvites, guilds } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId, isInviteUsable } from "@/lib/rbac";
import { CreateInviteForm } from "@/components/create-invite-form";
import { InviteRow } from "@/components/invite-row";
import { headers } from "next/headers";

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const session = await auth();
  const membership = requireGuildAdminPage(session);
  const { guildId: requestedGuildId } = await searchParams;
  const targetGuildId = await resolveAdminGuildId(membership, requestedGuildId);
  if (!targetGuildId) {
    return <p className="text-red-600">Guild not found.</p>;
  }

  const actingGuild = await db.query.guilds.findFirst({
    where: eq(guilds.id, targetGuildId),
  });
  const isImpersonating =
    membership.isSuperAdmin && targetGuildId !== membership.guildId;

  const invites = await db
    .select()
    .from(guildInvites)
    .where(eq(guildInvites.guildId, targetGuildId))
    .orderBy(desc(guildInvites.createdAt));

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  return (
    <div className="mx-auto max-w-3xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        {actingGuild ? `${actingGuild.name} — Invites` : "Invites"}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Generate links to invite people to your guild. Anyone with the link
        joins immediately.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Create Invite</h2>
        <CreateInviteForm guildId={targetGuildId} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">All Invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-gray-500">No invites yet.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => (
              <InviteRow
                key={inv.id}
                guildId={targetGuildId}
                inviteId={inv.id}
                code={inv.code}
                url={`${base}/join/${inv.code}`}
                expiresAt={inv.expiresAt}
                maxUses={inv.maxUses}
                usesCount={inv.usesCount}
                revokedAt={inv.revokedAt}
                usable={isInviteUsable(inv)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
