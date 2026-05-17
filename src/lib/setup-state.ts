import { db } from "@/db";
import { events, guildInvites, guilds, users } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isInviteUsable } from "@/lib/rbac";

// Onboarding checklist state for a guild. Each item is computed from the
// current DB state — no separate `setup_progress` table. That means the
// checklist is always consistent with what's actually configured, and an
// admin who completes a step in the underlying admin page sees it tick off
// the next time they reload the setup page.
//
// `kind` distinguishes "required" (counts toward "setup complete") from
// "optional" / "ongoing" (doesn't gate the banner). The 9-step list from
// the user's onboarding spec maps as follows:
//
//   1. Name           → required (always satisfied post-create)
//   2. Server #       → required
//   3. Description    → optional
//   4. Bot invited    → required (verified by discord_guild_id auto-link)
//   5. Bot channel    → required
//   6. Voice channels → optional (only used for the bot's pre-match voice-
//                       channel DM ~10 min before each squad start; the
//                       rest of the app — including @everyone reminders,
//                       slash commands, and roster management — works
//                       fine without them)
//   7. Invite link    → optional (admins can use stub members instead)
//   8. Members        → ongoing
//   9. Events         → ongoing

export type SetupItemKey =
  | "name"
  | "serverNumber"
  | "description"
  | "botInvited"
  | "botChannel"
  | "voiceChannels"
  | "inviteLink"
  | "events"
  | "members";

export type SetupItem = {
  key: SetupItemKey;
  done: boolean;
  // "required" items count toward the "setup complete" banner / redirect.
  // "optional" + "ongoing" are surfaced but don't gate completion.
  kind: "required" | "optional" | "ongoing";
};

export type SetupState = {
  items: SetupItem[];
  requiredDone: number;
  requiredTotal: number;
  allDone: number;
  total: number;
  isComplete: boolean;
};

export async function loadSetupState(guildId: string): Promise<SetupState> {
  const guild = await db.query.guilds.findFirst({
    where: eq(guilds.id, guildId),
  });
  if (!guild) {
    return emptyState();
  }

  // Roll the per-guild counts into a single round trip. `members` excludes
  // pending stubs from the "more than one member" check because a stub the
  // admin pre-claimed for themselves shouldn't count toward "has invited
  // someone else"; same logic for the creator.
  const [inviteRows, eventCountRow, memberCountRow] = await Promise.all([
    db
      .select({
        revokedAt: guildInvites.revokedAt,
        expiresAt: guildInvites.expiresAt,
        maxUses: guildInvites.maxUses,
        usesCount: guildInvites.usesCount,
      })
      .from(guildInvites)
      .where(eq(guildInvites.guildId, guildId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(eq(events.guildId, guildId), isNull(events.deletedAt)))
      .get(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.guildId, guildId))
      .get(),
  ]);

  const hasUsableInvite = inviteRows.some((r) => isInviteUsable(r));
  const eventCount = Number(eventCountRow?.count ?? 0);
  const memberCount = Number(memberCountRow?.count ?? 0);

  const items: SetupItem[] = [
    { key: "name", done: guild.name.trim().length > 0, kind: "required" },
    { key: "serverNumber", done: guild.serverNumber !== null, kind: "required" },
    {
      key: "description",
      done: !!guild.description && guild.description.trim().length > 0,
      kind: "optional",
    },
    {
      key: "botInvited",
      done: !!guild.discordGuildId,
      kind: "required",
    },
    {
      key: "botChannel",
      done: !!guild.discordChannelId,
      kind: "required",
    },
    {
      key: "voiceChannels",
      done: !!guild.squad1VoiceChannelId && !!guild.squad2VoiceChannelId,
      kind: "optional",
    },
    { key: "inviteLink", done: hasUsableInvite, kind: "optional" },
    { key: "members", done: memberCount > 1, kind: "ongoing" },
    { key: "events", done: eventCount > 0, kind: "ongoing" },
  ];

  const required = items.filter((i) => i.kind === "required");
  const requiredDone = required.filter((i) => i.done).length;
  const allDone = items.filter((i) => i.done).length;
  return {
    items,
    requiredDone,
    requiredTotal: required.length,
    allDone,
    total: items.length,
    isComplete: requiredDone === required.length,
  };
}

function emptyState(): SetupState {
  return {
    items: [],
    requiredDone: 0,
    requiredTotal: 0,
    allDone: 0,
    total: 0,
    isComplete: false,
  };
}
