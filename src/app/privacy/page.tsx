import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
};

const LAST_UPDATED = "2026-05-12";

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Privacy Policy
        </h1>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. What we collect">
        <p>When you sign in we collect:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>OAuth profile fields</strong> from Google or Discord —
            your email address, display name, and (for Discord) your account
            ID. These come from your OAuth provider; we never see your
            password.
          </li>
          <li>
            <strong>App-specific fields you enter</strong> — in-game name,
            duel preferences, language, optional Discord User ID, and any
            guild / event / signup / scrim / duel data you create.
          </li>
          <li>
            <strong>Operational data</strong> — session cookies, request
            logs, and timestamps needed to run the Service.
          </li>
        </ul>
      </Section>

      <Section title="2. How we use it">
        <ul className="ml-5 list-disc space-y-1">
          <li>To authenticate you and keep you signed in.</li>
          <li>
            To show your guild&rsquo;s events, signups, and members to the
            right people.
          </li>
          <li>
            To send Discord notifications (event reminders, duel proposals,
            etc.) if you&rsquo;ve opted in.
          </li>
          <li>To debug issues and protect the Service from abuse.</li>
        </ul>
        <p>
          We do not sell your data. We do not show third-party advertising.
        </p>
      </Section>

      <Section title="3. Who can see what">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Your in-game name and avatar</strong> are visible to
            other members of your guild on rosters and event pages.
          </li>
          <li>
            <strong>Your guild&rsquo;s events and signups</strong> are
            members-only — players in other guilds cannot see them.
          </li>
          <li>
            <strong>Your duel ratings and reputation</strong> are visible to
            other players on the same server who you&rsquo;ve enabled
            duel discovery for.
          </li>
          <li>
            <strong>Your email address</strong> is visible only to you and
            to super-admins of the Service.
          </li>
        </ul>
      </Section>

      <Section title="4. Discord direct messages">
        <p>
          If you provide a Discord User ID (or sign in with Discord), the
          Service&rsquo;s bot may DM you about duels, scrim proposals, or
          event reminders. You can disable DMs in{" "}
          <Link className="text-violet-700 underline dark:text-violet-300" href="/me">
            My Account
          </Link>{" "}
          at any time. Discord&rsquo;s own &ldquo;Allow direct messages from
          server members&rdquo; privacy setting also blocks the bot — we
          honor that.
        </p>
      </Section>

      <Section title="5. Cookies">
        <p>
          We use a small number of strictly necessary cookies for
          authentication and session management. We do not use analytics
          cookies or third-party tracking cookies.
        </p>
      </Section>

      <Section title="6. Data retention">
        <p>
          We keep your account data while your account exists. When you
          delete your account from{" "}
          <Link className="text-violet-700 underline dark:text-violet-300" href="/me">
            My Account
          </Link>
          , we remove your user row, your active signups, and your OAuth
          links. Historical attendance entries on past events may remain
          (soft-deleted) so guild admins can still review their guild&rsquo;s
          history. Server logs are rotated on a short cycle.
        </p>
      </Section>

      <Section title="7. Where data is stored">
        <p>
          The Service runs on Fly.io infrastructure. Application data is
          stored in a SQLite database on a persistent volume. Discord
          messages flow through Discord&rsquo;s infrastructure — see
          Discord&rsquo;s own privacy policy for how they handle them.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>
          You can review, edit, or delete your account data at any time
          from{" "}
          <Link className="text-violet-700 underline dark:text-violet-300" href="/me">
            My Account
          </Link>
          . For data-portability requests or other questions, reach out via
          the support Discord linked in the footer.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          The Service is not directed to children under 13. If you believe
          a child has created an account, contact us and we&rsquo;ll remove
          it.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update this policy as the Service evolves. Material changes
          will be surfaced in-app.
        </p>
      </Section>

      <footer className="border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        See also our{" "}
        <Link className="text-violet-700 underline dark:text-violet-300" href="/tos">
          Terms of Service
        </Link>
        .
      </footer>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}
