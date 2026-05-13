# Horizontal scaling plan

Current architecture is a single Fly machine: Next.js webapp + better-sqlite3 + in-process Discord bot, all backed by a SQLite file on a mounted volume at `/data/app.db`. This works fine at alpha-stage guild counts but scales vertically only. This document captures the path to horizontal scaling when we need it.

## Blockers in the current architecture

1. **SQLite on a single volume.** `n+1` machines = `n+1` divergent DBs. The DB driver (`better-sqlite3`) talks to a local file; nothing replicates.
2. **Discord.js gateway socket is singleton by design.** Discord delivers every event to every connected bot instance. Two machines running the bot = duplicate slash-command responses, duplicate `@everyone` reminders, duplicate heartbeats.
3. **Shared-state tables.** Auth.js sessions and the bot's idempotency tables (`event_notifications`, `duel_notifications`, plus `audit_log` for write-ordering) all live in the same SQLite file. They get fixed for free when the DB is centralized, but they break loudly without it.

## Two viable forward paths

### Path A — LiteFS (keep SQLite)

Fly's own SQLite replication. One writer, many readers; replicas serve local reads and forward writes to the primary via `LITEFS_HEADER_FORWARDING`.

- **Pros:** minimal Drizzle code changes — same dialect, same driver. Keeps the synchronous transaction style we rely on in `createSignup`, the soft-delete flows, and the audit-log inserts.
- **Cons:** replication lag is real — write-then-read on a replica can return stale data without an explicit `Lock-Replication` round-trip. Cluster ops (failover, primary promotion) is now our problem.
- **When it makes sense:** if we want "two webapp machines for HA" *without* touching the data layer.

### Path B — Move to Postgres (Fly Postgres / Neon)

Drizzle has a mature `pg` dialect; the schema translates directly except for SQLite-isms.

- **Pros:** real multi-writer semantics, no replication-lag drama, connection pooling, standard ops tooling, much easier hire/onboard story.
- **Cons:** dialect migration. Specifically:
  - `mode: "boolean"` on integer columns → native `boolean` in pg.
  - JSON-as-text columns (`audit_log.changes`, `events.metadata`) → native `jsonb`.
  - **The biggest refactor footprint: synchronous `db.transaction(...)` from better-sqlite3 vs. async in pg.** Roughly 30-40 call sites — `createSignup`, scrim/duel state machines, guild-leave cascade, super-admin guild-delete cascade. Each becomes `await db.transaction(async (tx) => { ... })`.
  - Lose the trivial "rm data/app.db, restart" reset workflow.
- **When it makes sense:** the destination state. LiteFS is a stepping stone we'd eventually replace.

## Bot, either way

The bot process must run on exactly one machine no matter which DB path we take. Approach:

- Split into two Fly process groups in `fly.toml`: `app` (webapp, scale 2+) and `bot` (scale exactly 1, `min_machines_running=1, auto_stop_machines=false`).
- Same Docker image, same code; `src/instrumentation-node.ts` gates the bot startup on `process.env.FLY_PROCESS_GROUP === "bot"`.
- Heartbeat in [src/bot/discord-bot.ts](src/bot/discord-bot.ts) already gives us a way to spot a dead bot machine.
- Bot HA via lease-table leader election is **not needed yet** — Discord gateway reconnects are fast (seconds), and the poll loop's idempotency tables mean a brief outage doesn't lose events. Add this only if we ever hit "bot machine fell over and we missed a reminder window."

## Auth.js session model

Currently uses DrizzleAdapter (DB-backed sessions). Switching to **JWT sessions** removes the `sessions` and `accounts.session` writes entirely from the hot path — sessions live in a signed cookie, the DB is hit only for the user row.

- Eliminates one table from any DB migration.
- Trade-off: revocation becomes harder (you can't kick a session by deleting a DB row — you have to rotate the secret or block by `user_id` somewhere).
- For an app where sign-out + sign-in is cheap and there's no "session compromise" use case yet, JWT is the right call.

## Recommended order

We don't need to scale yet. The right pre-work, in order:

1. **Now (quick win):** Split the bot into its own process group in `fly.toml`. Tiny config change, sets up either future path, and isolates "the bot crashed" from "the webapp crashed."
2. **Next (cheap win):** Switch Auth.js to JWT sessions. Smaller eventual migration surface and unlocks stateless webapp scaling later.
3. **When pain shows up** (~hundreds of guilds, or "we want webapp HA"): plan the Postgres migration as a single-PR refactor. Skip LiteFS — it's a transitional step we'd replace.

## One-line tradeoff

**LiteFS is cheaper to get to. Postgres is cheaper to live with.**
