import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// Auth.js required tables
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  inGameName: text("in_game_name"),
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

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
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
});
