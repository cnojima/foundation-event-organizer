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
  // Site-wide super-admin (replaces the old is_admin flag). Bootstrap manually via Drizzle Studio.
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  // One guild per user. Both columns null when the user has not joined a guild yet.
  guildId: text("guild_id").references((): AnySQLiteColumn => guilds.id, {
    onDelete: "set null",
  }),
  guildRole: text("guild_role", { enum: ["admin", "member"] }),
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
  gameTime: text("game_time"), // ISO datetime string
  signupOpens: text("signup_opens"), // ISO datetime string
  signupCloses: text("signup_closes"), // ISO datetime string
  // "match" — has two squads + signups + waitlist. "simple" — info-only event.
  kind: text("kind", { enum: ["match", "simple"] }).notNull().default("match"),
  squad1Name: text("squad1_name").notNull().default("Squad 1"),
  squad2Name: text("squad2_name").notNull().default("Squad 2"),
  maxPlayers: integer("max_players").notNull().default(20),
  maxBackups: integer("max_backups").notNull().default(10),
  leadershipSlots: integer("leadership_slots").notNull().default(3),
  metadata: text("metadata"), // JSON string for additional fields
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"), // ISO datetime; null = active. Soft-deleted events are kept for attendance reports.
});

// Tracks which notification kinds have been sent for each event. Composite
// PK (eventId, kind) makes the bot poll loop idempotent — duplicate inserts
// fail and are caught.
export const eventNotifications = sqliteTable(
  "event_notifications",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["day", "hour", "twenty_min"] }).notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.kind] }),
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
