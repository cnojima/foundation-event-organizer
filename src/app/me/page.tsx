import { auth } from "@/auth";
import { db } from "@/db";
import { accounts, guilds, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireSignedInPage } from "@/lib/rbac";
import { InGameNameForm } from "@/components/in-game-name-form";
import { LeaveGuildButton } from "@/components/leave-guild-button";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { DuelSettingsForm } from "@/components/duel-settings-form";
import { DiscordIdForm } from "@/components/discord-id-form";
import { MatchNotificationsForm } from "@/components/match-notifications-form";

export const metadata = {
  title: "My Account — Foundation Event Organizer",
};

export default async function MePage() {
  const session = await auth();
  const membership = requireSignedInPage(session);
  const t = await getTranslations("myAccount");
  const tMembers = await getTranslations("membersPage");

  const me = await db.query.users.findFirst({
    where: eq(users.id, membership.userId),
  });
  if (!me) {
    const tErrors = await getTranslations("errors");
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-red-600 dark:text-red-300">{tErrors("forbidden")}</p>
      </div>
    );
  }

  const guild = membership.guildId
    ? await db.query.guilds.findFirst({
        where: eq(guilds.id, membership.guildId),
      })
    : null;

  // Whether the bot can reach the user via DM. True if they've entered a
  // Discord User ID directly, OR if they signed in with Discord OAuth at
  // any point (legacy: providerAccountId in accounts is the snowflake).
  // Controls whether the duel DM toggle is editable.
  let discordReachable = !!me.discordUserId;
  if (!discordReachable) {
    const legacyLink = await db
      .select({ id: accounts.providerAccountId })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, membership.userId),
          eq(accounts.provider, "discord")
        )
      )
      .get();
    discordReachable = !!legacyLink;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("inGameName")}</h2>
        <InGameNameForm defaultValue={me.inGameName ?? ""} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("language")}</h2>
        <div className="rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <LocaleSwitcher />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("duels.heading")}</h2>
        <DuelSettingsForm
          defaultPowerTier={me.powerTier}
          defaultDiscoverable={me.discoverableForDuels}
          defaultDmEnabled={me.duelDmEnabled}
          discordLinked={discordReachable}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Match notifications</h2>
        <MatchNotificationsForm
          defaultVoiceDmEnabled={me.voiceDmEnabled}
          discordLinked={discordReachable}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("discord.heading")}
        </h2>
        <div className="space-y-3 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {discordReachable && (
            <div className="flex items-start gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t("discord.reachableTitle")}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t("discord.reachableBody")}
                </p>
              </div>
            </div>
          )}
          {!discordReachable && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t("discord.unreachableBody")}
            </p>
          )}
          <DiscordIdForm defaultValue={me.discordUserId} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("guildMembership")}</h2>
        {guild ? (
          <div className="rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t("youreInGuild", {
                role:
                  membership.guildRole === "admin"
                    ? tMembers("guildAdminLabel")
                    : tMembers("memberLabel"),
                guildName: guild.name,
              })}
            </p>
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40">
              <p className="mb-3 text-sm text-red-800 dark:text-red-300">
                {t("leaveExplanation")}
                {membership.guildRole === "admin" && ` ${t("leaveAdminWarning")}`}
              </p>
              <LeaveGuildButton />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            {t("notInGuild")}{" "}
            <a className="font-semibold text-violet-700 underline dark:text-violet-300" href="/guilds">
              {t("browseGuildsLink")}
            </a>{" "}
            {t("browseGuildsSuffix")}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
          {t("dangerZone")}
        </h2>
        <p className="mb-3 text-sm text-red-800 dark:text-red-300">{t("deleteExplanation")}</p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
