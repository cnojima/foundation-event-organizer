import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { PHASES } from "@/lib/damage-calculator/phases";

// Auth.js required tables
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  // Plaintext email — retained as a transitional fallback during the
  // hashed-email migration. New code paths read/write `email_hash` +
  // `email_encrypted` instead; this column will be dropped in a follow-up
  // migration once OAuth and credentials flows are verified end-to-end.
  email: text("email").unique(),
  // Deterministic HMAC of the lowercased email with EMAIL_PEPPER. Indexed
  // unique — used by the Auth.js adapter for getUserByEmail and by the
  // stub-claim flow for email-merge. Plaintext is never stored once this
  // is fully load-bearing.
  emailHash: text("email_hash").unique(),
  // AES-256-GCM ciphertext of the email under EMAIL_ENCRYPTION_KEY.
  // Recoverable form, decrypted only by the password-reset endpoint so
  // the user can be emailed a reset link. Format documented in
  // src/lib/email-crypto.ts.
  emailEncrypted: text("email_encrypted"),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  // Canonical sign-in identifier for the username/password auth flow.
  // Distinct from `inGameName` (the player's in-game display name, which
  // can be any unicode). Format rules in src/lib/username.ts: 3-30 chars,
  // lowercase letters/digits/hyphen/underscore, no leading/trailing
  // separators, not in the reserved list.
  username: text("username").unique(),
  // bcrypt hash of the user's password. Null = no credentials set; user
  // signs in via OAuth only. Format is whatever bcryptjs's hash() emits.
  passwordHash: text("password_hash"),
  inGameName: text("in_game_name"),
  // BCP-47 language tag (e.g., "en", "pt-BR", "zh-CN"). Null = use the
  // browser's Accept-Language header to pick a supported locale.
  locale: text("locale"),
  // Discord user ID (snowflake — 17-20 digit numeric string). Populated
  // automatically when a user signs in via Discord OAuth (see auth.ts
  // signIn event) OR manually entered on the /me page by users who
  // signed up via Google. Source of truth for bot DM delivery —
  // resolveDiscordUserId() prefers this over the legacy accounts-table
  // lookup.
  discordUserId: text("discord_user_id"),
  // Site-wide super-admin (replaces the old is_admin flag). Bootstrap manually via Drizzle Studio.
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  // One guild per user. Both columns null when the user has not joined a guild yet.
  guildId: text("guild_id").references((): AnySQLiteColumn => guilds.id, {
    onDelete: "set null",
  }),
  guildRole: text("guild_role", { enum: ["admin", "member"] }),
  // ---- 1v1 duels ----
  // Self-reported in-game power milestone (I–XIII). Null = not declared yet.
  // Shown on player cards and used as a filter on the discovery page.
  powerTier: text("power_tier", {
    enum: [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
      "XIII",
    ],
  }),
  // Opt-out switch for the cross-guild player discovery page. When false the
  // user is hidden from /players, the leaderboard, and challenge dropdowns —
  // their guild-internal experience is unaffected.
  discoverableForDuels: integer("discoverable_for_duels", { mode: "boolean" })
    .notNull()
    .default(true),
  // When true (default), the bot DMs the user about duel lifecycle events
  // (proposed/accepted/declined/cancelled/result-declared) instead of
  // posting to their guild channel. Only effective when the user has a
  // linked Discord OAuth account; users without a linked Discord account
  // get no notifications regardless of this setting.
  duelDmEnabled: integer("duel_dm_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  // When true (default), the bot DMs the user ~10 min before each squad
  // start in a match they're assigned to with a clickable voice-channel
  // join link. Per-user opt-out for players who find the personal ping
  // intrusive — toggled from /me on the website or via /settings in
  // Discord. The broader T-20 @everyone channel post is unaffected.
  voiceDmEnabled: integer("voice_dm_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  // ELO-style PvP rating. Starts at 1000, mutated only on confirmed duel
  // results. Separate from powerTier — measures on-platform performance,
  // not character strength.
  duelRating: integer("duel_rating").notNull().default(1000),
  // Denormalized W/L/D counts for fast display. Recomputable from
  // duel_proposals if drift is suspected. Defaults wrapped in `sql` because
  // Drizzle Kit's diff generator skips a literal `.default(0)` due to a
  // falsy-check (same for boolean `false`); using `sql\`0\`` forces the
  // DEFAULT clause into the migration so existing rows backfill cleanly.
  duelWins: integer("duel_wins").notNull().default(sql`0`),
  duelLosses: integer("duel_losses").notNull().default(sql`0`),
  duelDraws: integer("duel_draws").notNull().default(sql`0`),
  // ISO timestamp of the most recently confirmed duel — used to filter out
  // inactive players from the leaderboard and surface "active" badges.
  lastDuelAt: text("last_duel_at"),
  // Reputation aggregates from post-duel thumbs-up/down feedback. Individual
  // ratings live on the duel_proposals row; these are denormalized totals.
  feedbackUpCount: integer("feedback_up_count").notNull().default(sql`0`),
  feedbackDownCount: integer("feedback_down_count").notNull().default(sql`0`),
  // Admin-managed "stub" players. Set when a guild admin pre-creates a
  // member row before that player has signed in via OAuth. Both columns
  // cleared the first time the player signs in and the row is claimed (see
  // auth.ts signIn event). While set, the row functions as a regular guild
  // member for rostering/notifications but has no `accounts` row.
  stubCreatedByUserId: text("stub_created_by_user_id").references(
    (): AnySQLiteColumn => users.id,
    { onDelete: "set null" }
  ),
  stubCreatedAt: text("stub_created_at"),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compositePk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compositePk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// Application tables

export const guilds = sqliteTable("guilds", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  // Nullable: the creator may delete their account while the guild still
  // has members. We set this to null on user-delete rather than cascading,
  // since the guild belongs to its membership, not its founder.
  createdByUserId: text("created_by_user_id").references(
    (): AnySQLiteColumn => users.id,
    { onDelete: "set null" }
  ),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  // Discord channel the bot posts event reminders into. Null = notifications disabled.
  // The bot must be added to the server containing this channel via the install URL.
  discordChannelId: text("discord_channel_id"),
  // Auto-populated by the bot the first time it sends to this guild's channel
  // (or when the admin clicks "Test integration"). Used to map slash-command
  // interactions back to the app guild.
  discordGuildId: text("discord_guild_id"),
  // Optional per-squad voice channel IDs. When both are set, the bot DMs every
  // signed-up + assigned squadmate ~10 min before that squad's start time with
  // a clickable join link. Match events only. Either column nullable —
  // unconfigured = no voice-DM reminder for that squad.
  squad1VoiceChannelId: text("squad1_voice_channel_id"),
  squad2VoiceChannelId: text("squad2_voice_channel_id"),
  // Game-server number (1001-9999). Optional; surfaced for ops display only.
  serverNumber: integer("server_number"),
  // Short 2-4 character guild tag. When set, prepended to every member's
  // displayed name as "[<tag>] <name>".
  tag: text("tag"),
});

export const guildInvites = sqliteTable("guild_invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at"),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
});

// Per-guild presets that pre-populate the create-event form. Replaces the
// hardcoded KIND_DEFAULTS in create-event-form.tsx with editable rows.
// Date/time itself is never stored — varies per occurrence — but the signup
// window encodes a UTC weekday + time-of-day that snaps to the event's
// start time when the template is applied (e.g. "previous Monday 00:00 UTC
// relative to Saturday's match"). All four window columns nullable: null =
// template doesn't pre-fill the signup window.
export const eventTemplates = sqliteTable("event_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  // Shown in the template picker — distinct from `eventName`, which is the
  // default value pre-filled into the event's `name` field when applied.
  templateName: text("template_name").notNull(),
  eventName: text("event_name").notNull(),
  description: text("description"),
  kind: text("kind", { enum: ["match", "simple"] }).notNull(),
  squad1Name: text("squad1_name").notNull().default("Squad 1"),
  squad2Name: text("squad2_name").notNull().default("Squad 2"),
  maxPlayers: integer("max_players").notNull().default(20),
  maxBackups: integer("max_backups").notNull().default(10),
  leadershipSlots: integer("leadership_slots").notNull().default(3),
  durationMinutes: integer("duration_minutes"),
  // 0=Sunday, 1=Monday, ..., 6=Saturday. UTC.
  signupOpensWeekday: integer("signup_opens_weekday"),
  // "HH:MM" 24h UTC, e.g. "00:00".
  signupOpensTimeUtc: text("signup_opens_time_utc"),
  signupClosesWeekday: integer("signup_closes_weekday"),
  signupClosesTimeUtc: text("signup_closes_time_utc"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

// Server-wide events created by super-admins. Publishing creates one mirrored
// `events` row per guild on the target server (linked via events.globalEventId).
export const globalEvents = sqliteTable("global_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind", { enum: ["match", "simple"] }).notNull().default("match"),
  serverNumber: integer("server_number").notNull(),
  gameTime: text("game_time"),
  durationMinutes: integer("duration_minutes"),
  squad1StartsAt: text("squad1_starts_at"),
  squad2StartsAt: text("squad2_starts_at"),
  signupOpens: text("signup_opens"),
  signupCloses: text("signup_closes"),
  squad1Name: text("squad1_name").notNull().default("Squad 1"),
  squad2Name: text("squad2_name").notNull().default("Squad 2"),
  maxPlayers: integer("max_players").notNull().default(20),
  maxBackups: integer("max_backups").notNull().default(10),
  leadershipSlots: integer("leadership_slots").notNull().default(3),
  createdByUserId: text("created_by_user_id").references(
    (): AnySQLiteColumn => users.id,
    { onDelete: "set null" }
  ),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // For "simple" events, the start time. Match events leave this null and
  // use squad1StartsAt / squad2StartsAt instead so the two squads can play at
  // different times. Reminders, ICS export, and listings branch on `kind`.
  gameTime: text("game_time"), // ISO datetime string
  durationMinutes: integer("duration_minutes"), // optional; drives ICS DTEND for all event kinds
  squad1StartsAt: text("squad1_starts_at"), // match only; nullable until scheduled
  squad2StartsAt: text("squad2_starts_at"), // match only; nullable until scheduled
  signupOpens: text("signup_opens"), // ISO datetime string
  signupCloses: text("signup_closes"), // ISO datetime string
  // "match" — has two squads + signups + waitlist. "simple" — info-only.
  // "scrim" — single squad (this guild's lineup) facing another guild's
  // mirrored event. squad2Name/squad2StartsAt unused for scrim events.
  kind: text("kind", { enum: ["match", "simple", "scrim"] }).notNull().default("match"),
  squad1Name: text("squad1_name").notNull().default("Squad 1"),
  squad2Name: text("squad2_name").notNull().default("Squad 2"),
  maxPlayers: integer("max_players").notNull().default(20),
  maxBackups: integer("max_backups").notNull().default(10),
  leadershipSlots: integer("leadership_slots").notNull().default(3),
  metadata: text("metadata"), // JSON string for additional fields
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"), // ISO datetime; null = active. Soft-deleted events are kept for attendance reports.
  // Scrim-only: links back to the scrim_proposals row and identifies the
  // other guild. Both null for non-scrim events.
  scrimmageId: text("scrimmage_id"),
  opposingGuildId: text("opposing_guild_id").references(
    (): AnySQLiteColumn => guilds.id,
    { onDelete: "set null" }
  ),
  // Set when this event was created by publishing a global event. Null for
  // regular guild events. onDelete: set null preserves the row for attendance
  // history if the global event is deleted.
  globalEventId: text("global_event_id").references(
    (): AnySQLiteColumn => globalEvents.id,
    { onDelete: "set null" }
  ),
});

// Scrim proposals — negotiation phase between two guilds on the same
// server. On acceptance, two mirrored `events` rows are created (one per
// guild) linked back here via events.scrimmageId. Both guilds' admins can
// declare the result; we store an absolute (perspective-free) outcome that
// the UI translates to W/L from each viewer's side.
export const scrimProposals = sqliteTable("scrim_proposals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  proposingGuildId: text("proposing_guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  opposingGuildId: text("opposing_guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  proposedByUserId: text("proposed_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposedGameTime: text("proposed_game_time").notNull(),
  location: text("location").notNull(),
  winCondition: text("win_condition").notNull(),
  message: text("message"),
  status: text("status", {
    enum: ["pending", "accepted", "declined", "withdrawn", "cancelled"],
  })
    .notNull()
    .default("pending"),
  respondedByUserId: text("responded_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  respondedAt: text("responded_at"),
  proposingEventId: text("proposing_event_id").references(() => events.id, {
    onDelete: "set null",
  }),
  opposingEventId: text("opposing_event_id").references(() => events.id, {
    onDelete: "set null",
  }),
  // Result — absolute perspective. UI maps to W/L per viewer's guild side.
  result: text("result", {
    enum: ["proposing_won", "opposing_won", "draw", "no_contest"],
  }),
  resultNotes: text("result_notes"),
  resultDeclaredByUserId: text("result_declared_by_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  resultDeclaredAt: text("result_declared_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// 1v1 duels — player-to-player challenges, distinct from scrims (which are
// guild-to-guild). No mirrored events table needed since duels are just a
// two-person agreement; everything lives on this row. Result uses an
// absolute (perspective-free) enum so each side renders its own W/L. Same-
// server constraint and discoverableForDuels check are enforced at the API
// layer rather than via DB triggers.
export const duelProposals = sqliteTable("duel_proposals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  proposingUserId: text("proposing_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  opposingUserId: text("opposing_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposedGameTime: text("proposed_game_time").notNull(),
  location: text("location").notNull(),
  winCondition: text("win_condition").notNull(),
  message: text("message"),
  status: text("status", {
    enum: ["pending", "accepted", "declined", "withdrawn", "cancelled"],
  })
    .notNull()
    .default("pending"),
  respondedByUserId: text("responded_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  respondedAt: text("responded_at"),
  // Who most recently edited the proposal while pending. Null means no
  // edits have happened yet — treated as if the proposer made the
  // original offer (so the opposer is the one who can accept). Used to
  // enforce "you can't accept your own latest terms" for bidirectional
  // counter-proposals during negotiation.
  lastEditedByUserId: text("last_edited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Result lives on the same row (no events table for duels). Filled by
  // Phase 4 result-declaration flow; null until then.
  result: text("result", {
    enum: ["proposing_won", "opposing_won", "draw", "no_contest"],
  }),
  resultNotes: text("result_notes"),
  resultDeclaredByUserId: text("result_declared_by_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
  resultDeclaredAt: text("result_declared_at"),
  // Per-side post-duel feedback (thumbs up/down). Aggregates are
  // denormalized onto users.feedback_up_count / down_count.
  proposingFeedback: text("proposing_feedback", { enum: ["up", "down"] }),
  proposingFeedbackAt: text("proposing_feedback_at"),
  opposingFeedback: text("opposing_feedback", { enum: ["up", "down"] }),
  opposingFeedbackAt: text("opposing_feedback_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Tracks which duel reminder kinds have been sent. Composite PK
// (duelId, kind) — duels have no per-squad notion, just one cycle per
// duel. Mirrors event_notifications shape for poller symmetry.
export const duelNotifications = sqliteTable(
  "duel_notifications",
  {
    duelId: text("duel_id")
      .notNull()
      .references(() => duelProposals.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["day", "hour", "twenty_min"] }).notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.duelId, t.kind] }),
  })
);

// Tracks which notification kinds have been sent. Composite PK
// (eventId, squad, kind) makes the bot poll loop idempotent — duplicate
// inserts fail and are caught. `squad` is 0 for simple events (one cycle per
// event) and 1 or 2 for match events (independent cycles per squad).
export const eventNotifications = sqliteTable(
  "event_notifications",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    squad: integer("squad").notNull(),
    // "voice_dm" is a separate reminder kind that fires ~10 min before a
    // squad's start: instead of a channel post, the bot DMs each assigned
    // squadmate a clickable voice-channel link. Stored on the same table so
    // (eventId, squad, kind) gives us one idempotency row per squad-kind.
    kind: text("kind", {
      enum: [
        "day",
        "hour",
        "twenty_min",
        "voice_dm",
        "end_thirty_min",
        "end_five_min",
        "signup_close_hour",
        "signup_close_twenty_min",
        "signup_close_five_min",
      ],
    }).notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.squad, t.kind] }),
  })
);

// Per-guild audit trail. Every state-mutating API endpoint calls logAudit()
// (src/lib/audit.ts) after the mutation succeeds; failures are logged but
// never roll back the user's action — this table is observability, not the
// system of record.
//
// guildId is nullable because some actions are site-level (super-admin
// promotes another super-admin, super-admin soft-deletes a guild). Per-guild
// admin views filter `guildId = <theirs>`; super-admins can additionally
// view `guildId IS NULL` rows.
//
// `entityLabel` and `actorDisplay` are snapshots taken at write time so the
// log stays readable after the referenced row is renamed or deleted.
//
// `flaggedByUserId` / `flaggedAt` / `flagNote` are the admin "flag for
// review" controls — phase 1 of the per-guild changelog issue. Revert is
// deferred to phase 2.
export const auditLog = sqliteTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // SET NULL (not CASCADE) so audit history survives a guild hard-delete.
  // Snapshot fields (actorDisplay, entityLabel, action, changes) keep the row
  // readable; orphaned rows fall back to super-admin-only visibility via the
  // `guildId IS NULL` filter.
  guildId: text("guild_id").references(() => guilds.id, {
    onDelete: "set null",
  }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorDisplay: text("actor_display").notNull(),
  // Dot-namespaced action key, e.g. "event.create", "member.kick",
  // "guild.settings.update". Stable identifier — the UI maps these to
  // human-readable labels via i18n.
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  entityLabel: text("entity_label"),
  // JSON: { before?: Record<string, unknown>, after?: Record<string, unknown> }
  // Stored as text — SQLite has no native JSON column type.
  changes: text("changes"),
  flaggedByUserId: text("flagged_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  flaggedAt: text("flagged_at"),
  flagNote: text("flag_note"),
  createdAt: text("created_at").notNull(),
});

export const signups = sqliteTable("signups", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Stack-ranked preferences: 1 = first choice, 2 = second choice
  squad1Preference: integer("squad1_preference"), // 1 or 2
  squad2Preference: integer("squad2_preference"), // 1 or 2
  // Whether they want backup slot if main is full
  willingBackup: integer("willing_backup", { mode: "boolean" }).default(true),
  // Leadership request
  requestLeadership: integer("request_leadership", { mode: "boolean" }).default(false),
  leadershipNote: text("leadership_note"),
  // Admin tracking
  attended: integer("attended", { mode: "boolean" }),
  rating: integer("rating"), // 1-5 scale
  adminNotes: text("admin_notes"),
  // Assignment (set by admin or auto)
  assignedSquad: integer("assigned_squad"), // 1 or 2
  assignedRole: text("assigned_role"), // "player", "backup", "leader"
  createdAt: text("created_at").notNull(),
  // Soft-delete on guild leave/kick. Reads filter `deletedAt IS NULL`; admin
  // attendance reports may opt-in to include soft-deleted rows for history.
  deletedAt: text("deleted_at"),
  // True when the row was created post-event by an admin solely to track
  // attendance — the player never went through the signup flow. Used for
  // walk-ins, simple events (no signup), and "forgot to sign up but showed
  // up" cases. Reports still query `attended = TRUE`; this flag lets the
  // UI render these rows distinctly (no squad preference, no leadership
  // request) and skips them from waitlist / capacity calculations.
  attendanceOnly: integer("attendance_only", { mode: "boolean" })
    .notNull()
    .default(false),
});

// ---- Damage calculator (personal tool, super-admin only, not guild-scoped) ----
// Tracks raid damage screenshots for the "Calamity Befalls" event, replacing
// a manual spreadsheet. A "fleet" is one player's flagship identity — it
// persists across sessions (e.g. "Gram") since the same person always names
// their ship the same thing, while the champions crewed onto it are read
// fresh from each session's screenshots since rosters change per raid.
export const damageFleets = sqliteTable("damage_fleets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  // OCR only offers a best guess for this (the in-game icon is subtle/hard to
  // read reliably); it's confirmed/edited once by the admin and then reused.
  elementType: text("element_type", { enum: ["beam", "kinetic", "ion"] }),
  createdAt: text("created_at").notNull(),
});

export const damageSessions = sqliteTable("damage_sessions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  eventName: text("event_name").notNull().default("Calamity Befalls"),
  // Manual input — the battle data carries no timestamps. Null until the
  // admin fills it in; DPS can't be computed until then.
  totalTimeSeconds: real("total_time_seconds"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

// One row per entity (flagship or champion) per phase per session, extracted
// via Claude vision OCR from a single screenshot. Re-uploading a screenshot
// for the same (sessionId, phase, fleetId) replaces the prior rows for that
// triple rather than accumulating duplicates.
export const damageReadings = sqliteTable("damage_readings", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => damageSessions.id, { onDelete: "cascade" }),
  phase: text("phase", { enum: PHASES }).notNull(),
  fleetId: text("fleet_id")
    .notNull()
    .references(() => damageFleets.id),
  entityName: text("entity_name").notNull(),
  entityRole: text("entity_role", { enum: ["flagship", "champion"] }).notNull(),
  damageDealt: integer("damage_dealt").notNull(),
  healingDone: integer("healing_done").notNull().default(0),
  damageReceived: integer("damage_received").notNull().default(0),
  sourceFileName: text("source_file_name"),
  createdAt: text("created_at").notNull(),
});

// ---- Migration tracker ----
// Public, crowd-sourced tracker for players migrating between game servers.
// A "destination" is a game server (matched by number, like globalEvents),
// NOT an app guild — a server can host several app guilds at once, so access
// is gated by "admin of any guild on this server", not by a single guildId.
//
// A destination row is a bracketed migration WINDOW, not a permanent slot
// for a server: opensAt/closesAt bound one isolated migration event, and a
// server can have many rows over its lifetime (serverNumber is deliberately
// NOT unique). Status (upcoming/open/closed) is derived from the two dates
// at read time — see getWindowStatus() in src/lib/migration-tracker.ts —
// rather than stored, so there's one source of truth. Applications,
// allocations, and officers all FK to one destination row, so isolation
// between windows (nothing carries over when a server reopens) falls out
// for free from that scoping.
export const migrationDestinations = sqliteTable("migration_destinations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  serverNumber: integer("server_number").notNull(),
  classification: text("classification", { enum: ["high", "mid", "low"] })
    .notNull()
    .default("mid"),
  opensAt: text("opens_at").notNull(),
  closesAt: text("closes_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// Global — a player's power tier is independent of any destination server.
// Distinct from users.powerTier (roman numerals I-XIII, an unrelated duel
// matchmaking self-rating).
export const powerTierThresholds = sqliteTable("power_tier_thresholds", {
  tier: text("tier", { enum: ["ultra_high", "high", "mid", "low"] }).primaryKey(),
  flavorName: text("flavor_name").notNull(),
  minPower: integer("min_power"), // null for the bottom tier
});

// Global standard table (classification x tier -> default cap). Seed data
// only for MVP; not exposed in the admin UI since it's a cross-destination
// balance table that rarely changes (edit via db:studio if it ever does).
export const classificationDefaultAllocations = sqliteTable(
  "classification_default_allocations",
  {
    classification: text("classification", { enum: ["high", "mid", "low"] }).notNull(),
    tier: text("tier", { enum: ["ultra_high", "high", "mid", "low"] }).notNull(),
    maxSlots: integer("max_slots").notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.classification, table.tier] }) })
);

// Per-destination caps, seeded from classification_default_allocations when
// a destination is classified, independently overridable after that.
export const migrationAllocations = sqliteTable(
  "migration_allocations",
  {
    destinationId: text("destination_id")
      .notNull()
      .references(() => migrationDestinations.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["ultra_high", "high", "mid", "low"] }).notNull(),
    maxSlots: integer("max_slots").notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.destinationId, table.tier] }) })
);

// Signed-in users assigned to review applications for one destination.
// Distinct from guild-admin — an officer doesn't need to be an admin of any
// guild at all, just someone a server admin (or super-admin) has appointed.
export const migrationOfficers = sqliteTable(
  "migration_officers",
  {
    destinationId: text("destination_id")
      .notNull()
      .references(() => migrationDestinations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.destinationId, table.userId] }) })
);

// One row per migration application. Submitted anonymously (no account) via
// the public form; `editToken` is a high-entropy bearer secret (separate
// from `id`) that lets the submitter edit/withdraw without signing in —
// same split as guildInvites.code vs guildInvites.id.
export const migrationApplications = sqliteTable("migration_applications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  destinationId: text("destination_id")
    .notNull()
    .references(() => migrationDestinations.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  sourceServer: text("source_server").notNull(),
  power: integer("power").notNull(),
  tier: text("tier", { enum: ["ultra_high", "high", "mid", "low"] }).notNull(),
  desiredGuild: text("desired_guild"),
  gameUid: text("game_uid"),
  contact: text("contact"),
  status: text("status", {
    enum: ["applied", "waitlisted", "accepted", "denied", "withdrawn", "removed_by_admin"],
  })
    .notNull()
    .default("applied"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: text("reviewed_at"),
  reviewNote: text("review_note"),
  editToken: text("edit_token").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
