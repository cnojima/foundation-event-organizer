import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display";

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

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">{leftSlot}</div>
      <div className="flex items-center gap-4">
      <button
        type="button"
        className="relative grid size-9 place-items-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-label={t("notifications")}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
          <path
            d="M5 8a5 5 0 0 1 10 0v3l1.5 2.5h-13L5 11V8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="absolute right-1 top-1 size-2 rounded-full bg-violet-600 ring-2 ring-white" />
      </button>

      {user ? (
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName(user, guildTag)} image={user.image} size="size-9" />
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold text-gray-900">{displayName(user, guildTag)}</div>
            <div className="text-xs text-gray-500">
              {user.isSuperAdmin
                ? t("roleSuperAdmin")
                : user.guildRole === "admin"
                  ? t("roleGuildAdmin")
                  : user.guildRole === "member"
                    ? t("roleMember")
                    : t("roleNoGuild")}
            </div>
          </div>
          <SignOutButton />
        </div>
      ) : (
        <SignInButton />
      )}
      </div>
    </header>
  );
}
