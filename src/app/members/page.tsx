import Link from "next/link";
import { db } from "@/db";
import { users, guilds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { requireAnyGuildPage } from "@/lib/rbac";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Members",
};

// Read-only roster for any guild member. Same data as /admin/members but
// without the promote/demote/kick controls. Admins normally land on the
// admin version; this page is reachable by direct URL too.
export default async function MembersPage() {
  const session = await auth();
  const membership = requireAnyGuildPage(session);
  const t = await getTranslations("membersPage");
  const tHeader = await getTranslations("pageHeader.kicker");

  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, membership.guildId!),
  });
  if (!guild) {
    const tErrors = await getTranslations("errors");
    return <p className="text-red-600 dark:text-red-300">{tErrors("guildNotFound")}</p>;
  }

  const members = await db
    .select()
    .from(users)
    .where(eq(users.guildId, membership.guildId!))
    .orderBy(users.guildRole, users.name);

  const adminCount = members.filter((m) => m.guildRole === "admin").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker={tHeader("members")}
        title={t("titleNamed", { guildName: guild.name })}
        subtitle={t("summary", { count: members.length, admins: adminCount })}
      />

      <div className="space-y-2">
        {members.map((m) => (
          <Link
            key={m.id}
            href={`/players/${m.id}`}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all duration-150 hover:-translate-y-px hover:border-violet-400 hover:bg-gray-50 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-700 dark:hover:bg-gray-800 dark:hover:shadow-violet-950/40"
          >
            <UserAvatar name={displayName(m, guild.tag)} image={m.image} />
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {displayName(m, guild.tag)}
                </span>
                {m.guildRole === "admin" && (
                  <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
                    {t("adminBadge")}
                  </span>
                )}
                {m.id === membership.userId && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">(you)</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {m.guildRole === "admin"
                  ? t("guildAdminLabel")
                  : t("memberLabel")}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
