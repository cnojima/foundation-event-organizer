import { HelpViewedTracker } from "@/components/help-viewed-tracker";

export const metadata = {
  title: "Help — Foundation Event Organizer",
};

export default function HelpPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 text-gray-800">
      <HelpViewedTracker />
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Welcome to Foundation Event Organizer
        </h1>
        <p className="mt-2 text-gray-600">
          This is where your guild signs up for events — Shadowfront matches,
          scrims, and anything else the leadership wants on the calendar.
        </p>
      </header>

      <Section title="Getting in">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Sign in</strong> with Google or Discord on the home page.
          </li>
          <li>
            <strong>Join your guild.</strong> Most people get in via an invite
            link from a guild admin (<code>/join/&lt;code&gt;</code>). You can
            also browse public guilds at <code>/guilds</code>.
          </li>
          <li>
            Once you&apos;re in a guild, the home page shows that guild&apos;s
            upcoming events.
          </li>
        </ol>
        <p className="text-sm text-gray-600">
          You can only be in one guild at a time. To move, leave the current
          one first.
        </p>
      </Section>

      <Section title="Two kinds of events">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Match events</strong> (Shadowfront and similar) — two
            squads, each with their own start time, leadership slots, and a
            starting roster + backups.
          </li>
          <li>
            <strong>Simple events</strong> — info-only entries on the calendar
            (a meeting, an announcement, a watch party). No signup form; just a
            date and details.
          </li>
        </ul>
      </Section>

      <Section title="Signing up for a match">
        <p>Open the event from the home page. The signup form has three things:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Squad preference (first choice).</strong> Pick the squad
            you most want to play on. If your first choice is full, admins try
            to place you on the other.
          </li>
          <li>
            <strong>Willing to be a backup.</strong> On by default. Backups
            fill in when a starter drops. Uncheck this if you only want to play
            with a guaranteed starting slot.
          </li>
          <li>
            <strong>Request a leadership position</strong> (optional). Leaders
            coordinate the squad during the match. Admins assign leaders from
            the requests; you can leave a short note about why you&apos;d like
            the role.
          </li>
        </ol>
        <p>
          Hit <strong>Sign Up</strong>. You can come back and change any of
          these answers up until signups close.
        </p>
      </Section>

      <Section title="What your status means">
        <p>
          When you look at the squad rosters, you&apos;ll see one of these next
          to each name:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Player</strong> — on the starting roster.
          </li>
          <li>
            <strong>Backup</strong> — on the backup roster; plays only if a
            starter drops.
          </li>
          <li>
            <strong>Leader</strong> — chosen by an admin to lead the squad.
          </li>
          <li>
            <strong>Waitlist</strong> — all squad and backup slots were full
            when you signed up. You&apos;re promoted automatically if someone
            drops.
          </li>
          <li>
            <strong>Wants Leader</strong> — a player who asked for the role; an
            admin will pick from these.
          </li>
        </ul>
      </Section>

      <Section title="Reminders and calendar">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            If your guild has the Discord bot set up, the bot posts reminders
            1 day, 1 hour, and 20 minutes before each event in your guild&apos;s
            chosen channel.
          </li>
          <li>
            Every event page has a <strong>Download .ics</strong> link for
            adding the event to your calendar.
          </li>
          <li>
            Discord slash commands: <code>/upcoming</code> lists your
            guild&apos;s upcoming events, and <code>/signup</code> lets you
            sign up without leaving Discord. You have to sign in to the website
            with Discord at least once first, so the bot can match your
            account.
          </li>
        </ul>
      </Section>

      <Section title="If signups are closed">
        <p>
          The form turns into a &ldquo;Signups are closed&rdquo; message. Reach
          out to a guild admin if you need to be added late — they can adjust
          signups manually.
        </p>
      </Section>
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">
        {title}
      </h2>
      {children}
    </section>
  );
}
