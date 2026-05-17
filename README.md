# Foundation Event Organizer

A multi-guild event signup site for squad-based games. Each guild runs its own events, members, and admins. Optional Discord integration posts `@everyone` reminders 1 day, 1 hour, and 20 minutes before each event, and exposes `/upcoming` and `/signup` slash commands.

This repo is the source for [foundation-event-organizer.fly.dev](https://foundation-event-organizer.fly.dev) (or wherever an operator has deployed it).

---

## Setting up Discord notifications for your guild

This guide is for **guild admins** who want their Discord server to receive event reminders and slash commands.

### Prerequisites

Before you start, the **site operator** must have already deployed the app and configured the Discord bot. Ask them for:

- The **bot install URL**. It looks like:

```
https://discord.com/oauth2/authorize?client_id=1502013027858387054&scope=bot+applications.commands&permissions=133120
```

(`133120` = Slash Commands + Send Messages + Mention Everyone — both required so `@everyone` reminders actually ping members.)

- (Optionally) the bot's display name, so you can recognize it in your server.

If you're the site operator, see [CLAUDE.md](CLAUDE.md) → **Discord bot** for one-time setup (creating a Discord application, setting the `DISCORD_BOT_TOKEN` secret, etc.).

### Step 1 — Add the bot to your Discord server

1. Open the install URL in a browser.
2. Pick the Discord server you want to use from the dropdown. **You must have "Manage Server" permission** in that server.
3. Confirm the requested permissions. The bot needs:
   - **Send Messages** — to post reminders.
   - **Use Slash Commands** — automatically granted via the `applications.commands` scope.
4. Click **Authorize**. The bot will appear in your server's member list.

### Step 2 — Enable Developer Mode in Discord

This unlocks the "Copy Channel ID" right-click option, which you'll need in the next step.

1. Open Discord → **User Settings** (gear icon next to your name).
2. Scroll to **Advanced** in the sidebar.
3. Toggle **Developer Mode** on.

You only need to do this once per device.

### Step 3 — Copy your channel's ID

Pick the channel where you want event reminders posted. **The bot must be able to see and send messages in that channel** — make sure your channel permissions allow the bot's role.

1. Right-click the channel name in Discord's sidebar.
2. Click **Copy Channel ID** at the bottom of the menu.

You'll get a long number like `123456789012345678`.

### Step 4 — Paste the channel ID into Guild Settings

1. Sign in to the website.
2. Open your guild's **Settings** page (sidebar → Settings).
3. Paste the channel ID into **Discord channel ID**.
4. Click **Test integration**.

If everything is wired up, you'll see ✅ in the UI and a test message in your Discord channel:
> Test message from **Foundation Event Organizer** — guild &lt;name&gt;. Your Discord integration is working. Event reminders will be sent here.

The Test step also auto-links your Discord server to the app guild — this is what makes the slash commands work.

5. Click **Save** to persist the channel ID.

### What you get

- **Reminders** before every match event with a `gameTime`:
  - 24 hours before: "@everyone Big Match starts tomorrow."
  - 1 hour before: "@everyone Big Match starts in 1 hour."
  - 20 minutes before: "@everyone Big Match starts in 20 minutes."
  - If you reschedule an event, reminders fire fresh against the new time.
- **Slash commands** (work in any channel where the bot is present):
  - `/upcoming` — shows the next several events for your guild.
  - `/signup event:<event> squad:<1|2> [willing_backup]` — signs you up for a match. Requires you to have logged into the website with Discord at least once (so the bot can match your Discord ID to your account).

### Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| **Bot doesn't have access to that channel** when testing | Bot isn't in the server, or channel-level permissions deny it | Re-invite via the install URL; check channel permissions for the bot's role |
| **Bot is missing the Send Messages permission** | Channel permission overrides | In Discord: Channel → Edit Channel → Permissions → grant the bot's role Send Messages |
| **That channel ID doesn't exist (or the bot can't see it)** | You copied the wrong ID, or pasted a server ID instead of a channel ID | Right-click the **channel** name (not the server name) → Copy Channel ID |
| **The Discord bot is still connecting. Try again in a moment.** | Bot is restarting after a deploy | Wait ~10 seconds and click Test again |
| **The Discord bot isn't running on this server (DISCORD_BOT_TOKEN not set).** | The site operator hasn't configured the bot at all | Contact the operator |
| **`/upcoming` says "This Discord server isn't linked to a guild yet"** | You haven't run Test integration yet | Go to Guild Settings → Test integration. That auto-links the server. |
| Slash commands don't appear in Discord | Global commands take up to ~1 hour to propagate the first time | Wait, or restart your Discord client (Ctrl/Cmd+R) |
| `/signup` autocomplete shows "Loading options failed" while `/upcoming` works | Discord cached an outdated command schema, or the bot was added without the `applications.commands` scope | Re-invite the bot via the install URL (must include both `bot` and `applications.commands` scopes). If it still fails, ask your site operator to force-clear the cached schema (see below). |

#### Force-clear cached Discord commands (site operator)

If a recent slash-command schema change (option made non-required, autocomplete toggled, new commands added) doesn't propagate after waiting, the operator can wipe Discord's cached command list so the bot re-registers fresh on next startup:

```bash
# wipe global commands so the bot re-registers fresh on next startup
curl -X PUT -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  "https://discord.com/api/v10/applications/<APPLICATION_ID>/commands" \
  -d '[]'
```

Then restart the bot (`fly machine restart -a <app-name>`) — the `clientReady` handler re-registers commands from `SLASH_COMMANDS` on next boot.

### Removing the integration

- To stop notifications: clear the **Discord channel ID** field in Guild Settings → Save.
- To remove the bot from your server: Discord → Server Settings → Integrations → click the bot → Remove.

---

## Importing guild members from game screenshots

Guild admins can bulk-seed their member roster by uploading screenshots taken directly from the game's member list UI. The importer uses AI vision to extract in-game names, then cross-references them against your Discord server to pre-populate member records before anyone has signed into the site.

### How it works

1. Navigate to **Admin → Members → Import from Screenshots**.
2. Drag-and-drop or paste (Ctrl/Cmd+V) one or more screenshots of your in-game guild roster. Multiple images are treated as one batch — useful when the in-game list is paginated.
3. The app sends the images to Claude's vision API, which extracts every visible member name and deduplicates across images.
4. For each extracted name the bot queries your linked Discord server (`GET /guilds/{id}/members/search`) to resolve the Discord user ID. This works because in-game names are assumed to match Discord usernames.
5. A reconciliation table is shown with three buckets:

| Status | Meaning | Available actions |
| --- | --- | --- |
| ✅ **Linked** | Name matched an existing app account | None needed |
| ⚠️ **Pre-claimed** | Found on Discord, not yet in the app | Record created; they claim it on first sign-in |
| ❌ **Not in Discord** | Name extracted but no Discord match | Copy invite link, or dismiss |

6. Confirm to write the results. Pre-claimed members appear in the member list immediately and will automatically merge with their real account the first time they sign in via Discord OAuth.

### Requirements

- Your guild must have Discord integration enabled (Guild Settings → Discord channel ID → Test integration) so the bot knows which Discord server to search.
- The site operator must have enabled the **Server Members Intent** in the Discord Developer Portal (see [CLAUDE.md](CLAUDE.md) → **Discord bot** → Member import). Without it, the Discord lookup step is skipped and unmatched names are created as invite-only stubs with no Discord ID.
- `ANTHROPIC_API_KEY` must be set in the operator's environment (see [CLAUDE.md](CLAUDE.md) → **Environment variables**).

### Pre-claim accounts

A pre-claimed account is a lightweight placeholder row: it has a Discord ID and guild membership but no email or OAuth credentials. It is invisible to the pre-claimed user until they sign in. On first Discord sign-in the app detects the matching Discord ID, upgrades the placeholder to a full account, and preserves all existing guild membership data.

Pre-claimed accounts can sign up for events via the `/signup` Discord slash command before they ever visit the site, because the slash command matches on Discord ID.

---

## For operators / contributors

See [CLAUDE.md](CLAUDE.md) for:

- Project architecture (Next.js 16, SQLite + Drizzle, Auth.js, RBAC model).
- Local dev setup (`npm run dev`, OAuth credentials, schema push, super-admin bootstrap).
- Discord bot one-time setup (creating the Discord application, setting the `DISCORD_BOT_TOKEN` Fly secret, enabling the Server Members Intent for member import).
- Routes, API surface, and key design decisions.

### Quick local dev

```bash
cp .env.local.example .env.local   # fill in OAuth + AUTH_SECRET + ANTHROPIC_API_KEY
npx auth secret                    # generates AUTH_SECRET
npm install
npm run db:push                    # initialize SQLite
npm run dev
```

To make yourself a super-admin after first sign-in:

```bash
node scripts/promote-super-admin.mjs you@example.com
```

Sign out and back in to refresh your session.
