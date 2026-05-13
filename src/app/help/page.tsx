import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HelpViewedTracker } from "@/components/help-viewed-tracker";
import {
  CollapsibleSection,
  HelpLayout,
  type HelpSectionMeta,
} from "@/components/help-layout";

export const metadata = {
  title: "Help — Foundation Event Organizer",
};

// Translation strings are kept formatting-free; visual hierarchy
// (bold/emphasis/code) lives here at the JSX layer. The only tags allowed
// inside translated strings are functional link slots (<discoveryLink>,
// <scrimsLink>) — those represent in-app navigation that needs React
// rendering, not visual emphasis.
type Chunks = React.ReactNode;

export default async function HelpPage() {
  const t = await getTranslations("playerHelp");

  const sections: HelpSectionMeta[] = [
    { id: "getting-in", title: t("sections.gettingIn") },
    { id: "event-kinds", title: t("sections.eventKinds") },
    { id: "signup", title: t("sections.signup") },
    { id: "status", title: t("sections.status") },
    { id: "scrims", title: t("sections.scrims") },
    { id: "duels", title: t("sections.duels") },
    { id: "reminders", title: t("sections.reminders") },
    { id: "closed", title: t("sections.closed") },
  ];

  return (
    <HelpLayout sections={sections}>
      <HelpViewedTracker />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t("title")}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
      </header>

      <CollapsibleSection id="getting-in" title={t("sections.gettingIn")}>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("gettingIn.step1")}</li>
          <li>
            {t.rich("gettingIn.step2", {
              discoveryLink: (c: Chunks) => (
                <Link className="text-violet-700 underline dark:text-violet-300" href="/guilds">
                  {c}
                </Link>
              ),
            })}
          </li>
          <li>{t("gettingIn.step3")}</li>
        </ol>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("gettingIn.note")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="event-kinds" title={t("sections.eventKinds")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("eventKinds.match")}</li>
          <li>{t("eventKinds.scrim")}</li>
          <li>{t("eventKinds.simple")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="signup" title={t("sections.signup")}>
        <p>{t("signup.intro")}</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("signup.step1")}</li>
          <li>{t("signup.step2")}</li>
          <li>{t("signup.step3")}</li>
        </ol>
        <p>{t("signup.submit")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="status" title={t("sections.status")}>
        <p>{t("status.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("status.player")}</li>
          <li>{t("status.backup")}</li>
          <li>{t("status.leader")}</li>
          <li>{t("status.waitlist")}</li>
          <li>{t("status.wantsLeader")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="scrims" title={t("sections.scrims")}>
        <p>{t("scrims.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("scrims.oneSquad")}</li>
          <li>{t("scrims.opponent")}</li>
          <li>{t("scrims.result")}</li>
          <li>
            {t.rich("scrims.history", {
              scrimsLink: (c: Chunks) => (
                <Link className="text-violet-700 underline dark:text-violet-300" href="/scrims">
                  {c}
                </Link>
              ),
            })}
          </li>
        </ul>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("scrims.note")}</p>
      </CollapsibleSection>

      <CollapsibleSection id="duels" title={t("sections.duels")}>
        <p>{t("duels.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            {t.rich("duels.find", {
              playersLink: (c: Chunks) => (
                <Link className="text-violet-700 underline dark:text-violet-300" href="/players">
                  {c}
                </Link>
              ),
            })}
          </li>
          <li>{t("duels.powerTier")}</li>
          <li>{t("duels.challenge")}</li>
          <li>{t("duels.respond")}</li>
          <li>{t("duels.negotiate")}</li>
          <li>{t("duels.result")}</li>
          <li>{t("duels.rating")}</li>
          <li>
            {t.rich("duels.leaderboard", {
              leaderboardLink: (c: Chunks) => (
                <Link className="text-violet-700 underline dark:text-violet-300" href="/leaderboard">
                  {c}
                </Link>
              ),
            })}
          </li>
          <li>{t("duels.reputation")}</li>
          <li>
            {t.rich("duels.history", {
              duelsLink: (c: Chunks) => (
                <Link className="text-violet-700 underline dark:text-violet-300" href="/duels">
                  {c}
                </Link>
              ),
            })}
          </li>
          <li>{t("duels.discordDm")}</li>
          <li>{t("duels.privacy")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="reminders" title={t("sections.reminders")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t("reminders.bot")}</li>
          <li>{t("reminders.ics")}</li>
          <li>{t("reminders.slashCommands")}</li>
        </ul>
      </CollapsibleSection>

      <CollapsibleSection id="closed" title={t("sections.closed")}>
        <p>{t("closed")}</p>
      </CollapsibleSection>
    </HelpLayout>
  );
}
