# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Foundation Event Organizer — a multi-guild website for running squad-based event signups. Each guild has its own admins, members, and events. Players stack-rank their squad preference and can request leadership roles. Guild admins manage events, track attendance, and rate players.

## Commands

- `npm run dev` — start dev server (Next.js)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type check
- `npm run db:push` — push schema changes to SQLite
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:studio` — open Drizzle Studio (DB browser)

## Architecture

Next.js 16 App Router with SQLite (better-sqlite3 + Drizzle ORM). Auth via Auth.js (NextAuth v5) with Google and Discord OAuth providers.

- `src/db/schema.ts` — single source of truth (users, accounts, sessions, guilds, guildInvites, events, signups)
- `src/db/index.ts` — Drizzle client singleton; DB file lives at `data/app.db`
- `src/auth.ts` — Auth.js config; session callback enriches `session.user` with guild + super-admin context
- `src/lib/rbac.ts` — RBAC helpers (page guards, API guards, resource checks, slug/invite validation)
- `src/lib/ids.ts` — `generateId()` for hex IDs (events, signups). Guild/invite IDs use `crypto.randomUUID()` for parity with users.

### Roles

- **Super-admin** (`users.is_super_admin`) — site-wide. Bootstrapped manually in DB. Can act on any guild and promote others.
- **Guild admin** (`users.guild_role = "admin"`) — full CRUD inside their guild: events, signups, attendance, members, invites, settings.
- **Member** (`users.guild_role = "member"`) — sign up for their guild's events.
- A user is in at most one guild at a time (`users.guild_id` + `users.guild_role`).

### Routes

- `/` — current guild's event listing (redirects guildless users to `/guilds`)
- `/event/[id]` — event detail + signup form (members-only)
- `/guilds` — discovery (public guilds, signed-in users only)
- `/guilds/new` — create a new guild (creator becomes guild admin)
- `/guilds/[slug]` — guild detail with Join CTA
- `/join/[code]` — invite-link auto-join
- `/admin` — guild admin dashboard
- `/admin/event/[id]` — admin event detail
- `/admin/members`, `/admin/invites`, `/admin/settings` — guild admin tools
- `/super-admin`, `/super-admin/users` — super-admin tools
- `/api/auth/[...nextauth]` — Auth.js handlers
- `/api/signups` — POST/PUT for player signups
- `/api/admin/events`, `/api/admin/signups` — guild-admin event/signup mutations
- `/api/guilds`, `/api/guilds/[id]`, `/api/guilds/join`, `/api/guilds/leave` — guild lifecycle
- `/api/guilds/[id]/invites`, `/api/guilds/[id]/members/[userId]` — invite + member management
- `/api/super-admin/users/[id]`, `/api/super-admin/guilds/[id]` — super-admin actions

### Key Design Decisions

- All admin gates flow through `src/lib/rbac.ts`. Super-admins implicitly pass guild-admin checks; pages accept an optional `?guildId=` for super-admin "acting as" mode.
- Events carry `guild_id` (NOT NULL, cascade delete on guild deletion).
- Signups have `deleted_at` for soft-delete on guild leave/kick — preserves attendance history while hiding signups from the user.
- Soft-deleting a guild (super-admin only) cascades soft-delete to its events and nulls out members' `guild_id`/`guild_role`.
- Slugs are unique, lowercase, 3-40 chars. Reserved slugs in `RESERVED_SLUGS` (rbac.ts).
- Dates are ISO strings in TEXT columns.
- The `data/` directory is gitignored.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in OAuth credentials.
2. Run `npx auth secret` to generate `AUTH_SECRET`.
3. Run `npm run db:push` to initialize the database.
4. Sign in via OAuth so your user row exists.
5. Open `npm run db:studio`, find your `users` row, and set `is_super_admin = 1`.
6. Sign out and back in so the session picks up the new flag.
7. Visit `/guilds/new` to create your first guild.

## Seeding

`node scripts/seed-event.mjs [eventId]` populates an event with synthetic users. Seed users are auto-attached to the event's guild so they appear correctly in admin views.

## Discord bot

Posts `@everyone` reminders 1 day, 1 hour, and 20 minutes before each event's `gameTime`. Runs in-process inside the Next.js server (booted from [instrumentation.ts](instrumentation.ts) → [src/bot/discord-bot.ts](src/bot/discord-bot.ts)). Idempotent via [event_notifications](src/db/schema.ts) PK on `(event_id, kind)`.

### One-time Discord setup

1. Create a Discord application at <https://discord.com/developers/applications>.
2. Under **Bot**, reset/copy the bot token. Set it as a Fly secret:
   ```
   fly secrets set DISCORD_BOT_TOKEN=<token>
   ```
   Locally, put it in `.env.local`.
3. Build an install URL with **Send Messages + Mention Everyone** permissions (`permissions=133120`) and both `bot` + `applications.commands` scopes (the latter is required for slash commands; the Mention Everyone bit is required so `@everyone` reminders actually ping):
   ```
   https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=133120
   ```
4. Each guild admin uses that URL to add the bot to their Discord server, then enables **Developer Mode** (User Settings → Advanced) and copies the channel ID for their target channel into Guild Settings → Discord channel ID.
5. Click **Test integration** in Guild Settings — this also auto-links the Discord server ID to the app guild so slash commands work.

### Slash commands

Registered globally on bot startup. Visible in any server the bot is in (global commands take up to ~1 hour to propagate the first time):

- `/upcoming` — lists upcoming events for the linked app guild (ephemeral reply).
- `/signup event:<event> squad:<1|2> [willing_backup]` — signs the user up for an event with sensible defaults. Requires the user to have signed in to the website with Discord OAuth at least once (so the bot can map Discord ID → app user). The `event` field has autocomplete.

### Notes

- Polls every 5 min. Smallest reminder window is 25 min wide so notifications can't slip.
- The Fly machine has `min_machines_running = 1` and `auto_stop_machines = false` so the gateway socket stays open. The bot also requires `min_machines_running >= 1`; auto-stop would kill it.
- A failed post (bot kicked, channel deleted, missing perms) is logged but not retried — the `event_notifications` row is reserved before the post attempt to avoid spamming a misconfigured channel.
- Editing an event's `gameTime` clears its `event_notifications` rows so reminders fire fresh against the new time. Other field edits (signup window, squad sizes) don't clear.
