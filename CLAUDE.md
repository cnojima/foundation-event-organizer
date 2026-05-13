# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Foundation Event Organizer — a multi-guild website for running squad-based event signups. Each guild has its own admins, members, and events. Players stack-rank their squad preference and can request leadership roles. Guild admins manage events, track attendance, and rate players.

## Commands

- `npm run dev` — start dev server (Next.js)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type check
- `npm run db:generate` — generate a SQL migration file from `schema.ts` diffs (writes to `drizzle/`)
- `npm run db:migrate` — apply pending migrations to the DB (also runs automatically at app startup)
- `npm run db:migrate:baseline` — one-time bootstrap for DBs that predate the migrations folder (marks `0000_baseline.sql` as already applied)
- `npm run db:studio` — open Drizzle Studio (DB browser)
- `npm run db:push` — *discouraged.* Was used before we adopted versioned migrations; has surfaced a recurring "index already exists" bug on table recreations. Use `db:generate` + `db:migrate` instead.

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
- **Duel negotiation**: pending `duel_proposals` rows track `last_edited_by_user_id`. Either participant can `PATCH /api/duels/[id]` while pending; each edit stamps the editor. `POST /api/duels/[id]/accept` requires `caller !== effectiveLastEditor` (where `effectiveLastEditor = last_edited_by_user_id ?? proposing_user_id`), so neither side can lock in terms the other side hasn't seen since they last changed. Counter-proposals can ping-pong; Withdraw (proposer-only) and Decline (opposer-only) remain the unconditional exits.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in OAuth credentials.
2. Run `npx auth secret` to generate `AUTH_SECRET`.
3. Run `npm run db:migrate` to apply all migrations and create the DB.
4. Sign in via OAuth so your user row exists.
5. Open `npm run db:studio`, find your `users` row, and set `is_super_admin = 1`.
6. Sign out and back in so the session picks up the new flag.
7. Visit `/guilds/new` to create your first guild.

## Database migrations

Schema lives in [src/db/schema.ts](src/db/schema.ts). Changes flow through versioned SQL migrations in `drizzle/`.

**Adding a schema change:**

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate -- --name <short_description>`. Drizzle Kit diffs the schema against the previous snapshot in `drizzle/meta/` and writes a new `<N>_<name>.sql` migration file.
3. Inspect the generated SQL. If anything looks wrong (table recreations, unintended drops), refine the schema and regenerate.
4. Commit the schema change + the new migration file + the updated `drizzle/meta/` snapshot together.

**Applying migrations:**

- App startup runs migrations automatically (`src/db/migrate.ts`, called from `src/instrumentation-node.ts`). Idempotent — Drizzle tracks applied migrations in `__drizzle_migrations`.
- Explicit run: `npm run db:migrate`.

**Existing DBs created before this workflow:**

DBs that were initialized with `npm run db:push` (no migration history) need a one-time bootstrap so the migrator doesn't try to re-CREATE existing tables:

```
npm run db:migrate:baseline
```

This marks `0000_baseline.sql` as already applied. Subsequent migrations apply incrementally from there. Safe to re-run.

**On Fly / production:**

Migrations run on every machine restart via [src/instrumentation-node.ts](src/instrumentation-node.ts). For a deployed DB that's pre-migration, SSH in and run the baseline once:

```
fly ssh console -a <app> -C "node scripts/db-mark-baseline-applied.mjs"
```

Then redeploy — the in-process migrator will pick up from there.

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
3. Build an install URL with **Send Messages + Mention Everyone + Slash Commands** permissions (`permissions=2147616768`) and both `bot` + `applications.commands` scopes (the latter is required for slash commands; the Mention Everyone bit is required so `@everyone` reminders actually ping):
   ```
   https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=2147616768
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
