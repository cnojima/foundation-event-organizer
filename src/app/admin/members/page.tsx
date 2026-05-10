import { db } from "@/db";
import { users, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { requireGuildAdminPage, resolveAdminGuildId } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { MemberRowActions } from "@/components/member-row-actions";

export default async function MembersPage({
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

  const members = await db
    .select()
    .from(users)
    .where(eq(users.guildId, targetGuildId))
    .orderBy(users.guildRole, users.name);

  const adminCount = members.filter((m) => m.guildRole === "admin").length;

  return (
    <div className="mx-auto max-w-3xl">
      {isImpersonating && actingGuild && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Acting as admin of <strong>{actingGuild.name}</strong> (super-admin override).
        </div>
      )}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        {actingGuild ? `${actingGuild.name} — Members` : "Members"}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {members.length} member{members.length === 1 ? "" : "s"} · {adminCount} admin
        {adminCount === 1 ? "" : "s"}
      </p>

      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <UserAvatar name={displayName(m, actingGuild?.tag)} image={m.image} />
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {displayName(m, actingGuild?.tag)}
                  </span>
                  {m.guildRole === "admin" && (
                    <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                      Admin
                    </span>
                  )}
                  {m.id === membership.userId && (
                    <span className="text-xs text-gray-500">(you)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {m.guildRole === "admin" ? "Guild admin" : "Member"}
                </div>
              </div>
            </div>
            <MemberRowActions
              guildId={targetGuildId}
              userId={m.id}
              role={m.guildRole}
              isLastAdmin={m.guildRole === "admin" && adminCount <= 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
