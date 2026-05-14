import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { requireGuildAdminPage } from "@/lib/rbac";
import {
  CollapsibleSection,
  HelpLayout,
  type HelpSectionMeta,
} from "@/components/help-layout";

export const metadata = {
  title: "Admin Help — Foundation Event Organizer",
};

// Same i18n approach as /help: translation strings hold only prose.
// Visual styling (bold/em/code/pre) lives here at the JSX layer. The only
// in-message tags allowed are functional link slots (<helpLink>,
// <settingsLink>, <scrimmagesLink>, <scrimsLink>, <membersLink>,
// <invitesLink>, <playersLink>) which represent in-app navigation, not
// visual emphasis.
type Chunks = React.ReactNode;

// Hard-coded operator-shared snippets — never translated. The bot install
// URL is shown verbatim to the admin who copies it into Discord; the curl
// snippet is operator-only ops glue.
const INSTALL_URL =
  "https://discord.com/oauth2/authorize?client_id=1502013027858387054&scope=bot+applications.commands&permissions=133120";
const FLUSH_COMMANDS_CURL = `# wipe global commands so the bot re-registers fresh on next startup
curl -X PUT -H "Authorization: Bot $DISCORD_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  "https://discord.com/api/v10/applications/<APPLICATION_ID>/commands" \\
  -d '[]'`;

export default async function AdminHelpPage() {
  const session = await auth();
  requireGuildAdminPage(session);
  const t = await getTranslations("adminHelp");

  const sections: HelpSectionMeta[] = [
    { id: "create-match", title: t("sections.createMatch") },
    { id: "edit-event", title: t("sections.editEvent") },
    { id: "manage-players", title: t("sections.managePlayers") },
    { id: "waitlist", title: t("sections.waitlist") },
    { id: "scrims", title: t("sections.scrims") },
    { id: "invite-bot", title: t("sections.inviteBot") },
    { id: "discord-channel", title: t("sections.discordChannel") },
    { id: "slash-commands", title: t("sections.slashCommands") },
    { id: "manage-guild", title: t("sections.manageGuild") },
    { id: "players-page", title: t("sections.playersPage") },
    { id: "troubleshooting", title: t("sections.troubleshooting") },
  ];

  // Reusable link renderers — keep the in-app navigation paths out of
  // translated strings.
  const link = (href: string) => (c: Chunks) => (
    <Link className="text-violet-700 underline dark:text-violet-300" href={href}>
      {c}
    </Link>
  );

  return (
    <HelpLayout sections={sections}>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t.rich("subtitle", { helpLink: link("/help") })}
        </p>
      </header>

      <CollapsibleSection id="create-match" title={t("sections.createMatch")}>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("createMatch.step1")}</li>
          <li>{t("createMatch.step2")}</li>
          <li>{t("createMatch.step3")}</li>
          <li>{t("createMatch.step4")}</li>
          <li>{t("createMatch.step5")}</li>
          <li>{t("createMatch.step6")}</li>
          <li>{t("createMatch.step7")}</li>
        </ol>
      </CollapsibleSection>

      <CollapsibleSection id="edit-event" title={t("sections.editEvent")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("editEvent.dates")}</li>
          <li>{t("editEvent.reschedule")}</li>
          <li>{t("editEvent.softDelete")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="manage-players" title={t("sections.managePlayers")}>
        <p>{t("managePlayers.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("managePlayers.moveSquad")}</li>
          <li>{t("managePlayers.moveBackup")}</li>
          <li>{t("managePlayers.roleDropdown")}</li>
          <li>{t("managePlayers.attendedRating")}</li>
        </ul>
        <p>{t("managePlayers.effectiveSquadNote")}</p>
        <p>{t("managePlayers.leaderPillNote")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="waitlist" title={t("sections.waitlist")}>
        <p>{t("waitlist.intro")}</p>
        <p>{t("waitlist.promote")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="scrims" title={t("sections.scrims")}>
        <p>{t("scrims.intro")}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t.rich("scrims.serverNote", {
            settingsLink: link("/admin/settings"),
          })}
        </p>

        <h3 className="mt-4 font-semibold">{t("scrims.proposeHeading")}</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            {t.rich("scrims.proposeStep1", {
              scrimmagesLink: link("/admin/scrimmages"),
            })}
          </li>
          <li>{t("scrims.proposeStep2")}</li>
          <li>{t("scrims.proposeStep3")}</li>
          <li>{t("scrims.proposeStep4")}</li>
        </ol>

        <h3 className="mt-4 font-semibold">{t("scrims.acceptDeclineHeading")}</h3>
        <p>{t("scrims.acceptDeclineIntro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("scrims.accept")}</li>
          <li>{t("scrims.decline")}</li>
          <li>{t("scrims.withdraw")}</li>
        </ul>

        <h3 className="mt-4 font-semibold">{t("scrims.rosterHeading")}</h3>
        <p>{t("scrims.rosterBody")}</p>

        <h3 className="mt-4 font-semibold">{t("scrims.cancelHeading")}</h3>
        <p>{t("scrims.cancelBody")}</p>

        <h3 className="mt-4 font-semibold">{t("scrims.resultHeading")}</h3>
        <p>{t("scrims.resultIntro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("scrims.resultWonLost")}</li>
          <li>{t("scrims.resultDrawNc")}</li>
        </ul>
        <p>{t("scrims.resultBody")}</p>

        <h3 className="mt-4 font-semibold">
          {t("scrims.discordNotificationsHeading")}
        </h3>
        <p>{t("scrims.discordNotificationsBody")}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t("scrims.discordNotificationsFallback")}
        </p>

        <h3 className="mt-4 font-semibold">{t("scrims.playerVisibilityHeading")}</h3>
        <p>
          {t.rich("scrims.playerVisibilityBody", {
            scrimsLink: link("/scrims"),
          })}
        </p>
      </CollapsibleSection>

      <CollapsibleSection id="invite-bot" title={t("sections.inviteBot")}>
        <p>{t("inviteBot.intro")}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            {t("inviteBot.step1Intro")}
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900 dark:text-gray-200">
              {INSTALL_URL}
            </pre>
            <span className="mt-2 block">{t("inviteBot.step1Note")}</span>
          </li>
          <li>{t("inviteBot.step2")}</li>
          <li>{t("inviteBot.step3")}</li>
        </ol>
      </CollapsibleSection>

      <CollapsibleSection id="discord-channel" title={t("sections.discordChannel")}>
        <p>{t("discordChannel.intro")}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("discordChannel.step1")}</li>
          <li>{t("discordChannel.step2")}</li>
          <li>
            {t.rich("discordChannel.step3", {
              settingsLink: link("/admin/settings"),
            })}
          </li>
          <li>{t("discordChannel.step4")}</li>
          <li>{t("discordChannel.step5")}</li>
        </ol>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("discordChannel.commonErrors")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="slash-commands" title={t("sections.slashCommands")}>
        <p>{t("slashCommands.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("slashCommands.upcoming")}</li>
          <li>{t("slashCommands.signup")}</li>
        </ul>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("slashCommands.propagation")}</p>

        <h3 className="mt-4 font-semibold">{t("slashCommands.failHeading")}</h3>
        <p className="text-sm">{t("slashCommands.failIntro")}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>{t("slashCommands.failStep1")}</li>
          <li>
            {t("slashCommands.failStep2Intro")}
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900 dark:text-gray-200">
              {FLUSH_COMMANDS_CURL}
            </pre>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {t("slashCommands.failStep2Note")}
            </p>
          </li>
        </ol>
      </CollapsibleSection>

      <CollapsibleSection id="manage-guild" title={t("sections.manageGuild")}>
        <ul className="list-disc space-y-3 pl-5">
          <li>
            {t.rich("manageGuild.members", {
              membersLink: link("/admin/members"),
            })}
          </li>
          <li>
            {t.rich("manageGuild.invites", {
              invitesLink: link("/admin/invites"),
            })}
          </li>
          <li>
            {t.rich("manageGuild.settings", {
              settingsLink: link("/admin/settings"),
            })}
          </li>
          <li>{t("manageGuild.leave")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="players-page" title={t("sections.playersPage")}>
        <p>
          {t.rich("playersPage.body", {
            playersLink: link("/admin/players"),
          })}
        </p>
      </CollapsibleSection>

      <CollapsibleSection id="troubleshooting" title={t("sections.troubleshooting")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("troubleshooting.reminders")}</li>
          <li>{t("troubleshooting.rescheduled")}</li>
          <li>{t("troubleshooting.movedSquad")}</li>
        </ul>
      </CollapsibleSection>
    </HelpLayout>
  );
}
