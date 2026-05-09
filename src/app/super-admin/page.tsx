import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { requireSuperAdminPage } from "@/lib/rbac";
import { DateTime } from "@/components/date-time";
import { GuildLifecycleButton } from "@/components/guild-lifecycle-button";

export default async function SuperAdminPage() {
  const session = await auth();
  requireSuperAdminPage(session);

  const guildRows = await db
    .select({
      id: guilds.id,
      name: guilds.name,
      slug: guilds.slug,
      isPublic: guilds.isPublic,
      createdAt: guilds.createdAt,
      deletedAt: guilds.deletedAt,
      memberCount: sql<number>`(select count(*) from ${users} where ${users.guildId} = ${guilds.id})`,
    })
    .from(guilds)
    .orderBy(guilds.name);

  const userCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .get();
  const superAdminCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.isSuperAdmin} = 1`)
    .get();

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">
        Super Admin
      </h1>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Guilds" value={guildRows.length} />
        <Stat label="Users" value={Number(userCountRow?.count ?? 0)} />
        <Stat label="Super-admins" value={Number(superAdminCountRow?.count ?? 0)} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Guilds</h2>
        <Link
          href="/super-admin/users"
          className="text-sm font-semibold text-violet-700 hover:text-violet-900"
        >
          Manage super-admins →
        </Link>
      </div>

      <div className="space-y-2">
        {guildRows.map((g) => (
          <div
            key={g.id}
            className={`flex items-center justify-between gap-4 rounded-lg border bg-white px-4 py-3 ${
              g.deletedAt ? "border-gray-200 opacity-60" : "border-gray-200"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{g.name}</span>
                <code className="text-xs text-gray-500">{g.slug}</code>
                {!g.isPublic && (
                  <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                    Private
                  </span>
                )}
                {g.deletedAt && (
                  <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                    Deleted
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {g.memberCount} member{g.memberCount === 1 ? "" : "s"} · Created{" "}
                <DateTime iso={g.createdAt} mode="date" />
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href={`/admin?guildId=${g.id}`}
                className="rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-700 hover:bg-violet-100"
              >
                Manage as admin
              </Link>
              <GuildLifecycleButton guildId={g.id} isDeleted={!!g.deletedAt} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
    </div>
  );
}
