import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";
import { NotificationBell } from "@/components/notification-bell";
import { computeUserAlerts } from "@/lib/user-alerts";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";

export async function TopBar({
  leftSlot,
  guildTag,
}: {
  leftSlot?: React.ReactNode;
  guildTag?: string | null;
}) {
  const session = await auth();
  const user = session?.user;
  const t = await getTranslations("topBar");

  // Alerts are computed server-side per-request — cheap (one short DB
  // read) and avoids shipping the rule logic to the client. Skipped
  // entirely for signed-out visitors.
  const alerts = user?.id ? await computeUserAlerts(user.id) : [];

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-2">{leftSlot}</div>
      <div className="flex items-center gap-4">
      <ThemeToggle />
      {user && <LocaleSwitcher variant="compact" />}
      {user && <NotificationBell alerts={alerts} />}

      {user ? (
        <div className="flex items-center gap-3">
          <Link
            href="/me"
            className="flex items-center gap-3 rounded-md px-1 py-1 -mx-1 -my-1 hover:bg-gray-50 dark:hover:bg-gray-900"
            aria-label={t("myAccount")}
          >
            <UserAvatar name={displayName(user, guildTag)} image={user.image} size="size-9" />
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{displayName(user, guildTag)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {user.isSuperAdmin
                  ? t("roleSuperAdmin")
                  : user.guildRole === "admin"
                    ? t("roleGuildAdmin")
                    : user.guildRole === "member"
                      ? t("roleMember")
                      : t("roleNoGuild")}
              </div>
            </div>
          </Link>
          <SignOutButton />
        </div>
      ) : (
        <SignInButton />
      )}
      </div>
    </header>
  );
}
