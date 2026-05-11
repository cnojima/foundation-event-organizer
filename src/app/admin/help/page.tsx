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

// Section list — also drives the TOC. Order here matches the order on the page.
const SECTIONS: HelpSectionMeta[] = [
  { id: "create-match", title: "Create a match event" },
  { id: "edit-event", title: "Edit event details" },
  { id: "manage-players", title: "Manage players" },
  { id: "waitlist", title: "The waitlist" },
  { id: "scrims", title: "Run a scrim" },
  { id: "invite-bot", title: "Invite the Discord bot" },
  { id: "discord-channel", title: "Set up the Discord channel" },
  { id: "slash-commands", title: "Discord slash commands" },
  { id: "manage-guild", title: "Manage your guild" },
  { id: "players-page", title: "Players page" },
  { id: "troubleshooting", title: "Things you might run into" },
];

export default async function AdminHelpPage() {
  const session = await auth();
  requireGuildAdminPage(session);

  return (
    <HelpLayout sections={SECTIONS}>
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

      <CollapsibleSection id="create-match" title="Create a match event">
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
      </CollapsibleSection>

      <CollapsibleSection id="edit-event" title="Edit event details">
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
      </CollapsibleSection>

      <CollapsibleSection id="manage-players" title="Manage players">
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
      </CollapsibleSection>

      <CollapsibleSection id="waitlist" title="The waitlist">
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
      </CollapsibleSection>

      <CollapsibleSection id="scrims" title="Run a scrim">
        <p>
          A <strong>scrim</strong> is a 1-vs-1 guild challenge negotiated
          between two guild admins, with a single squad on each side. Once
          accepted, both guilds get a mirrored event that their members can
          sign up for. After the match either admin declares the result.
        </p>
        <p className="text-sm text-gray-600">
          <strong>Server # is required.</strong> Both guilds must have the same{" "}
          <em>Server #</em> set in Guild Settings — otherwise they won&apos;t
          appear in each other&apos;s opponent dropdown. Set yours in{" "}
          <a className="text-violet-700 underline" href="/admin/settings">
            /admin/settings
          </a>{" "}
          first.
        </p>
        <h3 className="mt-4 font-semibold">Propose a scrim</h3>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Go to{" "}
            <a className="text-violet-700 underline" href="/admin/scrimmages">
              /admin/scrimmages
            </a>{" "}
            and click <strong>+ Propose scrim</strong>.
          </li>
          <li>
            Pick the <strong>opponent</strong> (filtered to your same Server #),
            the <strong>game time</strong>, and the <strong>location</strong> —
            either one of the canonical maps (Kruger, Cerno, Kanvo, Sphinx) or
            a free-text custom location.
          </li>
          <li>
            Fill in the <strong>Condition of Win</strong> (required). State the
            rules clearly — both sides see this and it&apos;s tied to the
            declared result. Example: &ldquo;First team to 3 captures&rdquo; or
            &ldquo;Hold the central fortress for 5 minutes.&rdquo;
          </li>
          <li>
            Optional <strong>message</strong> for house rules, format notes,
            etc. Click <strong>Send proposal</strong>.
          </li>
        </ol>
        <h3 className="mt-4 font-semibold">Accept or decline an incoming proposal</h3>
        <p>
          Pending proposals from other guilds show up in the{" "}
          <strong>Incoming proposals</strong> section of the scrim dashboard.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Accept</strong> creates two mirrored events (one per guild)
            in a single transaction. Each side&apos;s event is named{" "}
            <em>&ldquo;Scrim vs &lt;opponent&gt;&rdquo;</em>, gets the proposed
            game time as its start, and accepts member signups like a normal
            match — except there&apos;s only one squad.
          </li>
          <li>
            <strong>Decline</strong> flips the proposal to <em>declined</em>{" "}
            without creating any events.
          </li>
          <li>
            <strong>Withdraw</strong> (outgoing only) cancels your own pending
            proposal before the other side responds.
          </li>
        </ul>
        <h3 className="mt-4 font-semibold">Roster the scrim event</h3>
        <p>
          The mirrored event lives under <strong>Manage Events</strong> with a
          red <strong>SCRIM</strong> badge. Open it to see your roster — single
          squad, same admin controls as a match (move to backup, role dropdown,
          attended, rating). Squad-2 columns and the second start time are
          hidden because they don&apos;t apply.
        </p>
        <h3 className="mt-4 font-semibold">Cancel an accepted scrim</h3>
        <p>
          Either guild&apos;s admin can <strong>Cancel</strong> from the
          dashboard while it&apos;s in <em>Upcoming scrims</em> and before a
          result is declared. Cancel soft-deletes both mirrored events
          (signups are kept for attendance history) and flips the proposal to{" "}
          <em>cancelled</em>.
        </p>
        <h3 className="mt-4 font-semibold">Declare the result</h3>
        <p>
          Open the scrim event under <strong>Manage Events</strong>. The
          result form has four buttons:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>We won</strong> / <strong>We lost</strong> — your guild&apos;s
            outcome. The server stores an absolute (perspective-free) result,
            so the opposing guild sees the inverse W/L automatically.
          </li>
          <li>
            <strong>Draw</strong> / <strong>No contest</strong> — symmetric
            outcomes. <em>No contest</em> covers forfeits, disconnects, or any
            scenario where the match didn&apos;t complete.
          </li>
        </ul>
        <p>
          Optional notes are visible to both guilds&apos; members. Once
          declared, the result shows up as a chip on the event page, the scrim
          dashboard, and players&apos; <code>/scrims</code> history. Either
          admin can declare — first one to submit wins (no overwrite UI).
        </p>
        <h3 className="mt-4 font-semibold">Discord notifications</h3>
        <p>
          If a guild has a Discord channel configured (see below), the bot
          posts an English message to <em>both</em> guilds&apos; channels on
          propose / accept / decline. The message includes the opponent name,
          game time (rendered in each viewer&apos;s local timezone), location,
          and condition of win.
        </p>
        <p className="text-sm text-gray-600">
          If the other guild has a channel configured but the bot can&apos;t
          reach it (bot kicked, channel deleted, wrong ID), you&apos;ll see a
          browser alert listing the affected guild names after your action
          completes. Guilds without any channel configured stay silent — that&apos;s
          an intentional opt-out.
        </p>
        <h3 className="mt-4 font-semibold">Player visibility</h3>
        <p>
          Players see scrim events on the home page with a red{" "}
          <strong>SCRIM</strong> badge, can sign up like any match (just one
          squad to pick), and can browse all accepted scrims (upcoming + past
          results) at{" "}
          <a className="text-violet-700 underline" href="/scrims">
            /scrims
          </a>
          . Declined / withdrawn / cancelled proposals are hidden from
          players — they only see scrims that actually happened or are
          scheduled.
        </p>
      </CollapsibleSection>

      <CollapsibleSection id="invite-bot" title="Invite the Discord bot">
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
      </CollapsibleSection>

      <CollapsibleSection id="discord-channel" title="Set up the Discord channel">
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
      </CollapsibleSection>

      <CollapsibleSection id="slash-commands" title="Discord slash commands">
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
        <h3 className="mt-4 font-semibold">
          If <code>/signup</code> autocomplete shows &ldquo;Loading options
          failed&rdquo;
        </h3>
        <p className="text-sm">
          Usually means Discord cached an outdated version of the command
          schema, or the bot was added with a missing scope. Try in order:
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Verify scopes and re-invite.</strong> The install URL must
            include both <code>bot</code> and{" "}
            <code>applications.commands</code>. If the bot was added via an
            older URL that was missing <code>applications.commands</code>,
            autocomplete events don&apos;t reach it. Re-invite using the
            current install URL (Guild Settings → Discord → Invite Event
            Organizer Discord Bot).
          </li>
          <li>
            <strong>Force-clear cached commands (operator only).</strong> If
            re-inviting doesn&apos;t fix it, your site operator can wipe
            Discord&apos;s cached command list so the bot re-registers fresh
            on next startup:
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
{`# wipe global commands so the bot re-registers fresh on next startup
curl -X PUT -H "Authorization: Bot $DISCORD_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  "https://discord.com/api/v10/applications/<APPLICATION_ID>/commands" \\
  -d '[]'`}
            </pre>
            <p className="mt-2 text-xs text-gray-600">
              Then restart the bot (e.g. <code>fly machine restart</code>) —
              the <code>clientReady</code> handler re-registers commands from{" "}
              <code>SLASH_COMMANDS</code> on next boot.
            </p>
          </li>
        </ol>
      </CollapsibleSection>

      <CollapsibleSection id="manage-guild" title="Manage your guild">
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
      </CollapsibleSection>

      <CollapsibleSection id="players-page" title="Players page">
        <p>
          <a className="text-violet-700 underline" href="/admin/players">
            /admin/players
          </a>{" "}
          shows every guild member with their full signup history: which events
          they signed up for, squad preferences, attendance, ratings, and
          leadership notes. Useful for picking leaders, building shortlists, or
          following up with no-shows.
        </p>
      </CollapsibleSection>

      <CollapsibleSection id="troubleshooting" title="Things you might run into">
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
      </CollapsibleSection>
    </HelpLayout>
  );
}
