import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Foundation Event Organizer",
};

const LAST_UPDATED = "2026-05-12";

export default function TermsOfServicePage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Terms of Service
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <Section title="1. What this is">
        <p>
          Foundation Event Organizer (&ldquo;the Service&rdquo;) is a free
          fan-made tool for organizing squad-based event signups, scrimmages,
          and 1-vs-1 duels for the Foundation Galactic Frontier community. It
          is not affiliated with, endorsed by, or operated by the game&rsquo;s
          publisher.
        </p>
      </Section>

      <Section title="2. Alpha software">
        <p>
          The Service is in active development and is provided
          &ldquo;as is&rdquo;. Features may change, break, or be removed
          without notice. Data may be lost during upgrades. Do not rely on the
          Service for anything time-sensitive without a backup plan.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          To use most features you sign in with Google or Discord. You are
          responsible for keeping access to that account secure. You are also
          responsible for the content you submit through the Service —
          including your in-game name, guild description, event details, and
          messages to other users.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>
          Don&rsquo;t use the Service to harass, threaten, impersonate, spam,
          or otherwise harm other users. Don&rsquo;t attempt to break the
          Service, scrape it at scale, or interfere with other guilds&rsquo;
          data. Guild admins may remove members and revoke invites at any
          time; super-admins may suspend accounts or guilds that violate
          these terms.
        </p>
      </Section>

      <Section title="5. Guild content">
        <p>
          Guilds are self-governing. Each guild&rsquo;s admins decide who can
          join, what events run, and how members are managed. The Service
          isolates guild data — events and signups are visible only to
          members of the guild that created them. You retain ownership of any
          content you submit; by submitting it you grant the Service a
          non-exclusive license to display it to other members of your guild
          and store it for normal operation.
        </p>
      </Section>

      <Section title="6. Discord integration">
        <p>
          Connecting Discord is optional. When you do (either via Discord
          OAuth or by manually entering your Discord User ID), the Service
          may send you direct messages about duels and events. You can
          disable DMs in your account settings, and Discord&rsquo;s own
          privacy settings remain the authoritative override.
        </p>
      </Section>

      <Section title="7. Termination">
        <p>
          You can delete your account at any time from{" "}
          <Link className="text-violet-700 underline" href="/me">
            My Account
          </Link>
          . Deletion removes your user record, signups, and unlinks any
          OAuth accounts. We may suspend or terminate accounts that violate
          these terms.
        </p>
      </Section>

      <Section title="8. No warranty / limitation of liability">
        <p>
          The Service is provided without warranty of any kind, express or
          implied. To the maximum extent permitted by law, the operators of
          the Service are not liable for any indirect, incidental, or
          consequential damages arising out of your use of the Service,
          including but not limited to lost data, missed events, or in-game
          consequences.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          These terms may be updated as the Service evolves. Material
          changes will be surfaced in-app. Continued use of the Service
          after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions? Reach out via the support Discord linked in the
          footer, or open an issue on the project&rsquo;s public GitHub
          repository.
        </p>
      </Section>

      <footer className="border-t border-gray-200 pt-4 text-xs text-gray-500">
        See also our{" "}
        <Link className="text-violet-700 underline" href="/privacy">
          Privacy Policy
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
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}
