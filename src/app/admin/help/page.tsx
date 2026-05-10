import { auth } from "@/auth";
import { requireGuildAdminPage } from "@/lib/rbac";

export const metadata = {
  title: "Admin Help — Foundation Event Organizer",
};

export default async function AdminHelpPage() {
  const session = await auth();
  requireGuildAdminPage(session);

  return (
    <article className="mx-auto max-w-3xl space-y-8 text-gray-800">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Admin guide
        </h1>
        <p className="mt-2 text-gray-600">
          Everything a guild admin needs to run events: creating matches,
          managing players, wiring up Discord, and tending the guild itself.
          The player-facing version of this is at{" "}
          <a className="text-violet-700 underline" href="/help">
            /help
          </a>
          .
        </p>
      </header>

      <Section title="Create a match event">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to <strong>Manage Events</strong> in the sidebar and click{" "}
            <strong>+ New event</strong>.
          </li>
          <li>
            Pick <strong>Match</strong> for the event type. Match events have
            two squads with their own start times, leadership slots, and a
            backup roster. (Pick <strong>Simple</strong> for info-only entries
            like meetings or watch parties — no signups, just a calendar item.)
          </li>
          <li>
            Fill in the name, optional description, and the{" "}
            <strong>signup window</strong> (Signup Opens / Signup Closes). The
            window is shared by both squads.
          </li>
          <li>
            Set <strong>Squad 1 Starts At</strong> and{" "}
            <strong>Squad 2 Starts At</strong>. Either or both can be left
            blank — players see &quot;TBD&quot; until you fill them in. Each
            squad&apos;s reminders fire independently from its own start time.
          </li>
          <li>
            All datetime fields are entered in your{" "}
            <strong>browser&apos;s local time</strong>. The form shows the UTC
            equivalent below each input so there&apos;s no ambiguity. Times are
            stored as UTC and rendered in each viewer&apos;s local zone.
          </li>
          <li>
            Optional: customize squad names, max players, max backups, and
            leadership slots. Defaults are 20 / 10 / 3 per squad (60 total
            slots).
          </li>
          <li>
            Click <strong>Create Event</strong>. You land on the event admin
            page.
          </li>
        </ol>
      </Section>

      <Section title="Edit event details after the fact">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Dates:</strong> on the event admin page, click{" "}
            <strong>Edit dates</strong>. You can change the signup window and
            both squad start times.
          </li>
          <li>
            <strong>Reschedule re-fires reminders:</strong> changing any start
            time clears the &quot;already sent&quot; record for that squad, so
            the Discord bot will fire fresh 24h / 1h / 20-min reminders against
            the new time. Tweaking by a couple of minutes also clears them, so
            avoid nudging unless you mean to re-notify.
          </li>
          <li>
            <strong>Soft delete:</strong> the <strong>Delete Event</strong>{" "}
            button hides the event from players but keeps the signup data for
            attendance reports. Deleted events show up under a separate
            &quot;Deleted&quot; section on Manage Events.
          </li>
        </ul>
      </Section>

      <Section title="Manage players">
        <p>
          The event admin page shows two squad columns and a waitlist below. In
          each squad column, every signup is a row with these controls:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>→ Squad N</strong> button: moves the player to the other
            squad in one click. Updates <code>assignedSquad</code>; if the new
            squad differs from their first-choice preference, a small{" "}
            <strong>MOVED</strong> badge appears next to their name so you
            remember you overrode their preference.
          </li>
          <li>
            <strong>→ Backup / → Roster</strong> button: toggles the player
            between the main roster (<em>player</em>) and the backup roster (
            <em>backup</em>). Works in any column, including the waitlist —
            handy for promoting a waitlister directly to backup.
          </li>
          <li>
            <strong>Role dropdown</strong> (Unassigned / Player / Backup /
            Leader / Waitlist): finer-grained role changes. Use this to promote
            a leadership-requesting player to <em>leader</em>, or to push
            someone onto the waitlist.
          </li>
          <li>
            <strong>Attended</strong> checkbox + <strong>1-5 star rating</strong>
            : post-event bookkeeping. Both auto-save when toggled. Used for
            future roster decisions.
          </li>
        </ul>
        <p>
          The squad columns group by <strong>effective squad</strong>: admin
          assignment wins, otherwise first-choice preference. So a player you
          move with <strong>→ Squad 2</strong> immediately appears in the
          Squad 2 column on the next render.
        </p>
        <p>
          The <strong>Leader</strong> yellow pill next to a name means that
          player asked for a leadership role on signup. Pick leaders from these
          requests by changing their role to <em>Leader</em>.
        </p>
      </Section>

      <Section title="The waitlist">
        <p>
          When all squad and backup slots are taken, new signups land in the
          waitlist (assigned role = <em>waitlist</em>). The waitlist section at
          the bottom of the event admin page shows them in signup order.
        </p>
        <p>
          To promote someone off the waitlist, change their role from{" "}
          <em>Waitlist</em> to <em>Player</em> or <em>Backup</em> via the
          dropdown — or use <strong>→ Backup</strong> for the common case.
          Their squad placement comes from their first-choice preference unless
          you explicitly move them.
        </p>
      </Section>

      <Section title="Invite the Discord bot">
        <p>
          Reminders and slash commands rely on a Discord bot the operator
          already deployed. To wire it up to your Discord server:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Get the <strong>install URL</strong> from your site operator. It
            looks like:
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
              https://discord.com/oauth2/authorize?client_id=1502013027858387054&amp;scope=bot+applications.commands&amp;permissions=133120
            </pre>
            The <code>permissions=133120</code> covers <em>Send Messages</em>{" "}
            and <em>Mention Everyone</em>. Both are required — without
            &ldquo;Mention Everyone&rdquo; the <code>@everyone</code> in
            reminders renders as plain text and doesn&apos;t ping anyone.
          </li>
          <li>
            Open the install URL in a browser. Pick the Discord server you want
            the bot in. You need the <strong>Manage Server</strong> permission
            in that server. Click <strong>Authorize</strong>.
          </li>
          <li>
            Confirm the bot appears in your Discord server&apos;s member list.
            That&apos;s it — no per-bot configuration on the Discord side.
          </li>
        </ol>
      </Section>

      <Section title="Set up the Discord channel">
        <p>
          The bot posts reminders into one channel of your choice. To configure
          it:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Enable <strong>Developer Mode</strong> in Discord:{" "}
            <em>User Settings → Advanced → Developer Mode</em>. One-time per
            device. This unlocks the &ldquo;Copy Channel ID&rdquo; right-click
            option.
          </li>
          <li>
            Right-click the channel you want reminders in → <strong>Copy Channel ID</strong>
            . You&apos;ll get a long number like <code>123456789012345678</code>.
            Make sure it&apos;s a <em>text</em> channel and that the bot&apos;s
            role has <strong>View Channel</strong> + <strong>Send Messages</strong>
            permissions there.
          </li>
          <li>
            On the website, go to{" "}
            <a className="text-violet-700 underline" href="/admin/settings">
              /admin/settings
            </a>{" "}
            and paste the channel ID into <strong>Discord channel ID</strong>.
          </li>
          <li>
            Click <strong>Test integration</strong>. If everything is right,
            you&apos;ll see ✅ in the UI and a one-off test message in the
            channel. The test step also auto-links your Discord server to the
            app guild so slash commands (<code>/upcoming</code>, <code>/signup</code>)
            work.
          </li>
          <li>
            Click <strong>Save</strong> to persist the channel ID.
          </li>
        </ol>
        <p className="text-sm text-gray-600">
          Common errors after Test:{" "}
          <em>&ldquo;Bot doesn&apos;t have access to that channel&rdquo;</em>{" "}
          (re-invite the bot, the install URL above);{" "}
          <em>&ldquo;Bot is missing the Send Messages permission&rdquo;</em>{" "}
          (channel-level permission overrides — fix in Discord);{" "}
          <em>&ldquo;That channel ID doesn&apos;t exist&rdquo;</em> (you copied
          the server ID, not the channel ID).
        </p>
      </Section>

      <Section title="Discord slash commands">
        <p>
          Once the bot is in the server and you&apos;ve linked the channel via
          Test integration, your members can use:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code>/upcoming</code> — lists the guild&apos;s upcoming events
            with both squad start times. Replies are ephemeral (only visible to
            the user).
          </li>
          <li>
            <code>/signup event:&lt;event&gt; squad:&lt;1|2&gt;</code> — signs
            the user up for an event. The <em>event</em> field has autocomplete.
            The user has to have signed in to the website with Discord at least
            once so the bot can match their Discord ID to their guild account —
            it&apos;ll prompt them if they haven&apos;t.
          </li>
        </ul>
        <p className="text-sm text-gray-600">
          New global slash commands take up to ~1 hour to propagate the first
          time after the bot deploys. After that, they&apos;re instant.
        </p>
      </Section>

      <Section title="Manage your guild">
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong>
              <a className="text-violet-700 underline" href="/admin/members">
                /admin/members
              </a>
            </strong>{" "}
            — list of everyone in the guild. Per row:{" "}
            <strong>Promote</strong> a member to admin, <strong>Demote</strong>{" "}
            an admin to member, or <strong>Kick</strong> a member out. The last
            admin can&apos;t demote or kick themselves — promote someone else
            first.
          </li>
          <li>
            <strong>
              <a className="text-violet-700 underline" href="/admin/invites">
                /admin/invites
              </a>
            </strong>{" "}
            — generate invite links. Each invite can have an optional expiry
            and a max-use cap (blank = unlimited). Click the URL to copy. Use{" "}
            <strong>Revoke</strong> to invalidate one. Anyone who hits a valid
            invite link auto-joins the guild as a member.
          </li>
          <li>
            <strong>
              <a className="text-violet-700 underline" href="/admin/settings">
                /admin/settings
              </a>
            </strong>{" "}
            — guild name, description, public-discovery toggle, Discord channel
            ID. The slug is permanent; everything else is editable. Toggling{" "}
            <strong>Listed in public discovery</strong> off means new members
            can only join via invite link.
          </li>
          <li>
            <strong>Leave the guild</strong> at the bottom of Settings. Your
            past signups are soft-deleted (kept for attendance reports). If
            you&apos;re the only admin, you have to promote someone else first.
          </li>
        </ul>
      </Section>

      <Section title="Players page (review history)">
        <p>
          <a className="text-violet-700 underline" href="/admin/players">
            /admin/players
          </a>{" "}
          shows every guild member with their full signup history: which events
          they signed up for, squad preferences, attendance, ratings, and
          leadership notes. Useful for picking leaders, building shortlists, or
          following up with no-shows.
        </p>
      </Section>

      <Section title="Things you might run into">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Reminders aren&apos;t firing.</strong> Check{" "}
            <code>/api/health</code> — if{" "}
            <code>bot.lastPollStartedAt</code> is more than ~5 min behind{" "}
            <code>now</code>, the poller is stuck. Super-admins can also POST
            to <code>/api/admin/bot/poll-now</code> to force a poll cycle.
          </li>
          <li>
            <strong>An event was rescheduled and people aren&apos;t getting
            re-notified.</strong> Confirm the time actually changed (compare
            against the previous value). The bot only re-fires kinds whose
            window is still ahead of the new time — if your new time is 30 min
            from now, only the 20-minute reminder will fire, not the 24h one.
          </li>
          <li>
            <strong>A player got assigned to the wrong squad after I moved
            them.</strong> The <strong>MOVED</strong> badge means assignment
            differs from preference. To revert, change their role/squad via the
            dropdown or use the <strong>→ Squad N</strong> button to flip them
            back.
          </li>
        </ul>
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
