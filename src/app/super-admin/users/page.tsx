import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { SuperAdminToggle } from "@/components/super-admin-toggle";

export default async function SuperAdminUsersPage() {
  const session = await auth();
  const me = requireSuperAdminPage(session);

  const rows = await db
    .select({
      user: users,
      guildName: guilds.name,
      guildTag: guilds.tag,
    })
    .from(users)
    .leftJoin(guilds, eq(users.guildId, guilds.id))
    .orderBy(users.name);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
        All Users
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Toggle super-admin on any user. The last super-admin can&apos;t demote themselves.
      </p>

      <div className="space-y-2">
        {rows.map(({ user: u, guildName, guildTag }) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <UserAvatar name={displayName(u, guildTag)} image={u.image} />
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{displayName(u, guildTag)}</span>
                  {u.isSuperAdmin && (
                    <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                      Super
                    </span>
                  )}
                  {u.id === me.userId && (
                    <span className="text-xs text-gray-500">(you)</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  ID {u.id.slice(0, 8)}
                  {guildName && ` · ${guildName} (${u.guildRole})`}
                </div>
              </div>
            </div>
            <SuperAdminToggle userId={u.id} isSuperAdmin={u.isSuperAdmin === true} />
          </div>
        ))}
      </div>
    </div>
  );
}
