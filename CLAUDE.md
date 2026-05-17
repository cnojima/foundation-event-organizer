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
- `src/lib/ocr.ts` — sends screenshots to Claude vision API; returns deduplicated in-game name list
- `src/bot/discord.ts` — Discord API helpers including `searchDiscordGuildMembers()` for member import lookups

### Roles

- **Super-admin** (`users.is_super_admin`) — site-wide. Bootstrapped manually in DB. Can act on any guild and promote others.
- **Guild admin** (`users.guild_role = "admin"`) — full CRUD inside their guild: events, signups, attendance, members, invites, settings.
- **Member** (`users.guild_role = "member"`) — sign up for their guild's events.
- **Pre-claim** (`users.status = "pre_claim"`) — placeholder created by the member import flow. Has a Discord ID and guild membership but no OAuth credentials. Automatically upgraded to a full member on first Discord sign-in.
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
- `/admin/members` — member list + Import from Screenshots entry point
- `/admin/members/import` — screenshot upload → reconciliation wizard (guild admin only)
- `/admin/invites`, `/admin/settings` — guild admin tools
- `/super-admin`, `/super-admin/users` — super-admin tools
- `/api/auth/[...nextauth]` — Auth.js handlers
- `/api/signups` — POST/PUT for player signups
- `/api/admin/events`, `/api/admin/signups` — guild-admin event/signup mutations
- `/api/admin/members/import` — POST: accepts base64 screenshots, returns OCR names + Discord lookup results
- `/api/admin/members/import/confirm` — POST: writes pre-claim stubs and discord_id links to DB
- `/api/guilds`, `/api/guilds/[id]`, `/api/guilds/join`, `/api/guilds/leave` — guild lifecycle
- `/api/guilds/[id]/invites`, `/api/guilds/[id]/members/[userId]` — invite + member management
- `/api/super-admin/users/[id]`, `/api/super-admin/guilds/[id]` — super-admin actions

### Key Design Decisions

- **Single-machine by design.** Webapp + SQLite + Discord bot run in one Fly machine. Horizontal scaling has three real blockers (SQLite-on-volume, singleton Discord gateway, shared idempotency tables) — see [TODO_FLY.md](TODO_FLY.md) for the analysis and migration paths (LiteFS vs Postgres) before touching `fly.toml` or the data layer.
- All admin gates flow through `src/lib/rbac.ts`. Super-admins implicitly pass guild-admin checks; pages accept an optional `?guildId=` for super-admin "acting as" mode.
- Events carry `guild_id` (NOT NULL, cascade delete on guild deletion).
- Signups have `deleted_at` for soft-delete on guild leave/kick — preserves attendance history while hiding signups from the user.
- Soft-deleting a guild (super-admin only) cascades soft-delete to its events and nulls out members' `guild_id`/`guild_role`.
- Slugs are unique, lowercase, 3-40 chars. Reserved slugs in `RESERVED_SLUGS` (rbac.ts).
- Dates are ISO strings in TEXT columns.
- The `data/` directory is gitignored.
- **Duel negotiation**: pending `duel_proposals` rows track `last_edited_by_user_id`. Either participant can `PATCH /api/duels/[id]` while pending; each edit stamps the editor. `POST /api/duels/[id]/accept` requires `caller !== effectiveLastEditor` (where `effectiveLastEditor = last_edited_by_user_id ?? proposing_user_id`), so neither side can lock in terms the other side hasn't seen since they last changed. Counter-proposals can ping-pong; Withdraw (proposer-only) and Decline (opposer-only) remain the unconditional exits.
- **Pre-claim users**: `users.status = 'pre_claim'` rows have no email, no `accounts` row, and were created by the member import flow. The `signIn` callback in `src/auth.ts` checks for a matching `discord_id` on a pre-claim row when a new Discord OAuth sign-in arrives; if found it upgrades the row in place (sets `status = 'active'`, lets Auth.js create the `accounts` row against the existing `users.id`) rather than inserting a new user. This preserves all prior guild membership and event history.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in OAuth credentials.
2. Run `npx auth secret` to generate `AUTH_SECRET`.
3. Run `npm run db:migrate` to apply all migrations and create the DB.
4. Sign in via OAuth so your user row exists.
5. Open `npm run db:studio`, find your `users` row, and set `is_super_admin = 1`.
6. Sign out and back in so the session picks up the new flag.
7. Visit `/guilds/new` to create your first guild.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_SECRET` | ✅ | Session signing secret. Generate with `npx auth secret`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ✅ | Google OAuth app credentials. |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | ✅ | Discord OAuth app credentials (same application as the bot). |
| `DISCORD_BOT_TOKEN` | ✅ (for bot) | Bot token from Discord Developer Portal → Bot → Reset Token. |
| `ANTHROPIC_API_KEY` | ✅ (for member import) | API key for Claude vision used in the screenshot OCR import flow. Get one at [console.anthropic.com](https://console.anthropic.com). |

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

```bash
npm run db:migrate:baseline
```

This marks `0000_baseline.sql` as already applied. Subsequent migrations apply incrementally from there. Safe to re-run.

**On Fly / production:**

Migrations run on every machine restart via [src/instrumentation-node.ts](src/instrumentation-node.ts). For a deployed DB that's pre-migration, SSH in and run the baseline once:

```bash
fly ssh console -a <app> -C "node scripts/db-mark-baseline-applied.mjs"
```

Then redeploy — the in-process migrator will pick up from there.

### Schema: member import additions

The member import feature adds two columns to `users`:

```ts
// src/db/schema.ts additions
discord_id: text('discord_id').unique(),
status: text('status', { enum: ['active', 'pre_claim'] })
  .notNull()
  .default('active'),
```

- `discord_id` — Discord snowflake. Set for any user who has logged in via Discord OAuth (via the `accounts` table join) or whose record was pre-created by the import flow. Unique constraint prevents duplicate stubs.
- `status` — `'active'` for all normal users; `'pre_claim'` for import-created stubs that haven't been claimed yet.

Generate and apply the migration after editing the schema:

```bash
npm run db:generate -- --name add_discord_id_and_status_to_users
npm run db:migrate
```

## Seeding

`node scripts/seed-event.mjs [eventId]` populates an event with synthetic users. Seed users are auto-attached to the event's guild so they appear correctly in admin views.

## Discord bot

Posts `@everyone` reminders 1 day, 1 hour, and 20 minutes before each event's `gameTime`. Runs in-process inside the Next.js server (booted from [instrumentation.ts](instrumentation.ts) → [src/bot/discord-bot.ts](src/bot/discord-bot.ts)). Idempotent via [event_notifications](src/db/schema.ts) PK on `(event_id, kind)`.

### One-time Discord setup

1. Create a Discord application at <https://discord.com/developers/applications>.
2. Under **Bot**, reset/copy the bot token. Set it as a Fly secret:

```bash
fly secrets set DISCORD_BOT_TOKEN=<token>
```

Locally, put it in `.env.local`.

3. **Enable the Server Members Intent.** Under **Bot → Privileged Gateway Intents**, toggle on **Server Members Intent**. This is required for the member import feature to search Discord guild members by username. Without it, `/api/admin/members/import` degrades gracefully — the Discord lookup step is skipped and unmatched names become invite-only stubs with no Discord ID.

4. Build an install URL with **Send Messages + Mention Everyone + Slash Commands** permissions (`permissions=133120`) and both `bot` + `applications.commands` scopes (the latter is required for slash commands; the Mention Everyone bit is required so `@everyone` reminders actually ping):

```
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=133120
```

5. Each guild admin uses that URL to add the bot to their Discord server, then enables **Developer Mode** (User Settings → Advanced) and copies the channel ID for their target channel into Guild Settings → Discord channel ID.
6. Click **Test integration** in Guild Settings — this also auto-links the Discord server ID to the app guild so slash commands and member import work.

### Member import

The import flow is initiated from `/admin/members/import` (guild admin only). The sequence is:

1. Admin uploads/pastes game screenshots. The frontend converts images to base64 and POSTs them to `/api/admin/members/import`.
2. The API route calls `src/lib/ocr.ts` → Claude `claude-sonnet-4-20250514` vision model with a prompt that extracts member names and returns a JSON array. Model: `claude-sonnet-4-20250514`, `max_tokens: 1024`.
3. For each extracted name the API calls `searchDiscordGuildMembers()` in `src/bot/discord.ts`, which hits `GET /guilds/{discord_guild_id}/discord_guild_id/members/search?query={name}&limit=5` using the bot token. The guild's `discord_guild_id` is stored when Test integration is run.
4. Matches are classified:
   - **Exact username or global_name match** → use that Discord ID.
   - **Multiple results / ambiguous** → flag for admin review; don't auto-link.
   - **Zero results** → no Discord ID; create as invite-only stub.
5. The API returns a reconciliation payload. The admin reviews and confirms via `POST /api/admin/members/import/confirm`, which writes `users` rows (`status = 'pre_claim'`, `discord_id`, `guild_id`, `guild_role = 'member'`) for each unmatched name, and updates `discord_id` on existing users where found.

**Claim flow** (in `src/auth.ts` `signIn` callback):

```ts
if (account.provider === 'discord') {
  const discordId = account.providerAccountId;
  const preClaim = db.select().from(users)
    .where(and(eq(users.discord_id, discordId), eq(users.status, 'pre_claim')))
    .get();
  if (preClaim) {
    // update name/image from live Discord profile, set status = 'active'
    // return preClaim.id so Auth.js links the new accounts row here
    // suppress default createUser path
  }
}
```

### Slash commands

Registered globally on bot startup. Visible in any server the bot is in (global commands take up to ~1 hour to propagate the first time):

- `/upcoming` — lists upcoming events for the linked app guild (ephemeral reply).
- `/signup event:<event> squad:<1|2> [willing_backup]` — signs the user up for an event with sensible defaults. Requires the user to have signed in to the website with Discord OAuth at least once **or** to have been pre-claimed via the member import flow (the bot matches on `discord_id` either way). The `event` field has autocomplete.

### Notes

- Polls every 5 min. Smallest reminder window is 25 min wide so notifications can't slip.
- The Fly machine has `min_machines_running = 1` and `auto_stop_machines = false` so the gateway socket stays open. The bot also requires `min_machines_running >= 1`; auto-stop would kill it.
- A failed post (bot kicked, channel deleted, missing perms) is logged but not retried — the `event_notifications` row is reserved before the post attempt to avoid spamming a misconfigured channel.
- Editing an event's `gameTime` clears its `event_notifications` rows so reminders fire fresh against the new time. Other field edits (signup window, squad sizes) don't clear.
- `searchDiscordGuildMembers()` requires the Server Members Intent (see step 3 above). If the intent is missing, Discord returns 403; the import API catches this, logs a warning, and proceeds without Discord ID resolution rather than failing the whole import.
