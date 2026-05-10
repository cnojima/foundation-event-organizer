import { auth } from "@/auth";
import { db } from "@/db";
import { guilds, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireSignedInPage } from "@/lib/rbac";
import { InGameNameForm } from "@/components/in-game-name-form";
import { LeaveGuildButton } from "@/components/leave-guild-button";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { LocaleSwitcher } from "@/components/locale-switcher";

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
        <p className="text-red-600">{tErrors("forbidden")}</p>
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
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("inGameName")}</h2>
        <InGameNameForm defaultValue={me.inGameName ?? ""} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("language")}</h2>
        <div className="rounded-lg border bg-white p-4">
          <LocaleSwitcher />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("guildMembership")}</h2>
        {guild ? (
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-gray-700">
              {t("youreInGuild", {
                role:
                  membership.guildRole === "admin"
                    ? tMembers("guildAdminLabel")
                    : tMembers("memberLabel"),
                guildName: guild.name,
              })}
            </p>
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="mb-3 text-sm text-red-800">
                {t("leaveExplanation")}
                {membership.guildRole === "admin" && ` ${t("leaveAdminWarning")}`}
              </p>
              <LeaveGuildButton />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-700">
            {t("notInGuild")}{" "}
            <a className="font-semibold text-violet-700 underline" href="/guilds">
              {t("browseGuildsLink")}
            </a>{" "}
            {t("browseGuildsSuffix")}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-red-700">
          {t("dangerZone")}
        </h2>
        <p className="mb-3 text-sm text-red-800">{t("deleteExplanation")}</p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
