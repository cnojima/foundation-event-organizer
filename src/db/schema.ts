import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// Auth.js required tables
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
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
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references((): AnySQLiteColumn => users.id),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  // Discord channel the bot posts event reminders into. Null = notifications disabled.
  // The bot must be added to the server containing this channel via the install URL.
  discordChannelId: text("discord_channel_id"),
  // Auto-populated by the bot the first time it sends to this guild's channel
  // (or when the admin clicks "Test integration"). Used to map slash-command
  // interactions back to the app guild.
  discordGuildId: text("discord_guild_id"),
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
    .references(() => users.id),
  expiresAt: text("expires_at"),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
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
    .references(() => users.id),
  proposedGameTime: text("proposed_game_time").notNull(),
  location: text("location").notNull(),
  winCondition: text("win_condition").notNull(),
  message: text("message"),
  status: text("status", {
    enum: ["pending", "accepted", "declined", "withdrawn", "cancelled"],
  })
    .notNull()
    .default("pending"),
  respondedByUserId: text("responded_by_user_id").references(() => users.id),
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
    () => users.id
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
  respondedByUserId: text("responded_by_user_id").references(() => users.id),
  respondedAt: text("responded_at"),
  // Who most recently edited the proposal while pending. Null means no
  // edits have happened yet — treated as if the proposer made the
  // original offer (so the opposer is the one who can accept). Used to
  // enforce "you can't accept your own latest terms" for bidirectional
  // counter-proposals during negotiation.
  lastEditedByUserId: text("last_edited_by_user_id").references(() => users.id),
  // Result lives on the same row (no events table for duels). Filled by
  // Phase 4 result-declaration flow; null until then.
  result: text("result", {
    enum: ["proposing_won", "opposing_won", "draw", "no_contest"],
  }),
  resultNotes: text("result_notes"),
  resultDeclaredByUserId: text("result_declared_by_user_id").references(
    () => users.id
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
    kind: text("kind", { enum: ["day", "hour", "twenty_min"] }).notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.squad, t.kind] }),
  })
);

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
});
