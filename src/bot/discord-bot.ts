import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Channel,
  type Guild,
  type RESTPostAPIApplicationCommandsJSONBody,
  type TextChannel,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { accounts, events, guildInvites, guilds, users } from "@/db/schema";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  buildMessage,
  findPending,
  recordSent,
  type NotificationTarget,
} from "@/lib/notifications";
import {
  findPendingDuels,
  recordSentDuel,
} from "@/lib/duel-notifications";
import { createSignup } from "@/lib/signups";

// 5-minute poll cadence — small enough to never miss a notification window
// (smallest window is 25 min wide), large enough that DB pressure is trivial.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Bot state on globalThis so the singleton survives Next.js compiling the
// same module into multiple chunks (instrumentation.ts and route handlers
// can otherwise end up with separate module instances and therefore
// separate `started`/`client` flags).
type BotState = {
  client: Client | null;
  started: boolean;
  loginAt: string | null;
  // Diagnostic counters updated on each poll cycle. Surfaced via /api/health
  // for operator-side observability.
  lastPollStartedAt: string | null;
  lastPollDurationMs: number | null;
  lastPollPendingCount: number | null;
  lastPollSentCount: number | null;
  lastPollFailedCount: number | null;
};
const STATE_KEY = Symbol.for("foundation.discord-bot.state");
type GlobalWithBot = typeof globalThis & { [STATE_KEY]?: BotState };

function getState(): BotState {
  const g = globalThis as GlobalWithBot;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      client: null,
      started: false,
      loginAt: null,
      lastPollStartedAt: null,
      lastPollDurationMs: null,
      lastPollPendingCount: null,
      lastPollSentCount: null,
      lastPollFailedCount: null,
    };
  }
  return g[STATE_KEY]!;
}

const SLASH_COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    name: "upcoming",
    description: "List upcoming events for this guild",
    type: ApplicationCommandType.ChatInput,
  },
  {
    name: "signup",
    description: "Sign up for an upcoming match or scrim event",
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: "event",
        description: "Pick an upcoming event",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
      {
        name: "squad",
        description: "Your first-choice squad (match events only — ignored for scrims)",
        type: ApplicationCommandOptionType.Integer,
        required: false,
        choices: [
          { name: "Squad 1", value: 1 },
          { name: "Squad 2", value: 2 },
        ],
      },
      {
        name: "willing_backup",
        description: "Willing to be a backup if main roster fills up",
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
    ],
  },
];

export function startBot(): void {
  const state = getState();
  if (state.started) return;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[bot] DISCORD_BOT_TOKEN not set — skipping bot startup.");
    return;
  }
  state.started = true;

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  state.client = client;

  client.once("clientReady", () => {
    state.loginAt = new Date().toISOString();
    console.log(
      `[bot] logged in as ${client.user?.tag} pid=${process.pid} at=${state.loginAt}`
    );
    void registerSlashCommands();
    void runOnce();
    setInterval(() => void runOnce(), POLL_INTERVAL_MS);
  });

  client.on("interactionCreate", (interaction) => {
    if (interaction.isChatInputCommand()) {
      void handleChatCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      void handleAutocomplete(interaction);
    }
  });

  // Gateway lifecycle — silent gateway drops are the most common cause of
  // "the bot looks alive but reminders stopped firing". Logging these makes
  // disconnects diagnosable from `fly logs`.
  client.on("shardDisconnect", (event, shardId) => {
    console.warn(
      `[bot] shard ${shardId} disconnected code=${event.code} reason=${event.reason || "(none)"}`
    );
  });
  client.on("shardReconnecting", (shardId) => {
    console.log(`[bot] shard ${shardId} reconnecting…`);
  });
  client.on("shardResume", (shardId, replayed) => {
    console.log(`[bot] shard ${shardId} resumed (replayed ${replayed} events)`);
  });
  client.on("shardError", (err, shardId) => {
    console.error(`[bot] shard ${shardId} error:`, err);
  });
  client.on("error", (err) => {
    console.error("[bot] client error:", err);
  });

  void client.login(token).catch((err) => {
    console.error("[bot] login failed:", err);
    state.started = false;
    state.client = null;
  });
}

// Read-only snapshot of bot state — exposed via /api/health.
export function getBotStatus() {
  const state = getState();
  return {
    started: state.started,
    isReady: state.client?.isReady() === true,
    user: state.client?.user?.tag ?? null,
    loginAt: state.loginAt,
    lastPollStartedAt: state.lastPollStartedAt,
    lastPollDurationMs: state.lastPollDurationMs,
    lastPollPendingCount: state.lastPollPendingCount,
    lastPollSentCount: state.lastPollSentCount,
    lastPollFailedCount: state.lastPollFailedCount,
    nextPollExpectedAt: state.lastPollStartedAt
      ? new Date(
          new Date(state.lastPollStartedAt).getTime() + POLL_INTERVAL_MS
        ).toISOString()
      : null,
  };
}

// Triggered by POST /api/admin/bot/poll-now. Returns metrics so the caller
// can verify the path end-to-end without scrolling logs.
export async function triggerPoll(): Promise<{
  ok: boolean;
  reason?: string;
  metrics?: PollMetrics;
}> {
  const state = getState();
  if (!state.started) {
    return { ok: false, reason: "Bot is not started (DISCORD_BOT_TOKEN not set)." };
  }
  if (!state.client?.isReady()) {
    return { ok: false, reason: "Bot is not connected to Discord yet." };
  }
  const metrics = await runOnce();
  return { ok: true, metrics };
}

async function registerSlashCommands(): Promise<void> {
  const { client } = getState();
  if (!client?.application) return;
  try {
    await client.application.commands.set(SLASH_COMMANDS);
    console.log("[bot] slash commands registered globally");
  } catch (err) {
    console.error("[bot] failed to register slash commands:", err);
  }
}

// ---- Notification poller ----

type PollMetrics = {
  pending: number;
  sent: number;
  failed: number;
  durationMs: number;
};

async function runOnce(): Promise<PollMetrics> {
  const state = getState();
  const startedAt = new Date();
  const startedIso = startedAt.toISOString();
  state.lastPollStartedAt = startedIso;

  const noop = (reason: string): PollMetrics => {
    const durationMs = Date.now() - startedAt.getTime();
    state.lastPollDurationMs = durationMs;
    state.lastPollPendingCount = 0;
    state.lastPollSentCount = 0;
    state.lastPollFailedCount = 0;
    console.log(
      `[bot] poll skipped reason=${reason} at=${startedIso} durationMs=${durationMs}`
    );
    return { pending: 0, sent: 0, failed: 0, durationMs };
  };

  const { client } = state;
  if (!client?.isReady()) return noop("not-ready");

  console.log(`[bot] poll start at=${startedIso}`);

  let pending: NotificationTarget[];
  try {
    pending = await findPending();
  } catch (err) {
    console.error("[bot] findPending failed:", err);
    return noop("findPending-error");
  }

  let sent = 0;
  let failed = 0;
  for (const p of pending) {
    if (!recordSent(p.eventId, p.squadNumber, p.kind)) continue;
    try {
      const channel = await client.channels.fetch(p.channelId);
      await persistDiscordGuildIdIfNeeded(p.guildId, channel);
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        console.warn(
          `[bot] channel ${p.channelId} for guild ${p.guildId} is not text-based; skipping`
        );
        failed++;
        continue;
      }
      await (channel as TextChannel).send({
        content: buildMessage(p),
        allowedMentions: { parse: ["everyone"] },
      });
      sent++;
      console.log(
        `[bot] notified event=${p.eventId} squad=${p.squadNumber} kind=${p.kind} channel=${p.channelId}`
      );
    } catch (err) {
      failed++;
      console.error(
        `[bot] post failed event=${p.eventId} squad=${p.squadNumber} kind=${p.kind} channel=${p.channelId}:`,
        err
      );
    }
  }

  // ---- Duel reminders ----
  // Separate from the event loop because duels DM both players directly
  // (no guild channel) and have their own idempotency table. Failures
  // here don't roll back the recordSent step — once the kind is locked,
  // we move on. (DM-disabled recipients can't be retried.)
  let duelPending = 0;
  let duelSent = 0;
  let duelFailed = 0;
  try {
    const duelTargets = await findPendingDuels();
    duelPending = duelTargets.length;
    for (const d of duelTargets) {
      if (!recordSentDuel(d.duelId, d.kind)) continue;
      try {
        await sendDuelNotification({
          proposingUserId: d.proposingUserId,
          opposingUserId: d.opposingUserId,
          action: "reminder",
          proposedGameTime: d.proposedGameTime,
          location: d.location,
          winCondition: d.winCondition,
          duelId: d.duelId,
          reminderKind: d.kind,
        });
        duelSent++;
        console.log(
          `[bot] duel reminder duel=${d.duelId} kind=${d.kind} sent`
        );
      } catch (err) {
        duelFailed++;
        console.error(
          `[bot] duel reminder failed duel=${d.duelId} kind=${d.kind}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error("[bot] findPendingDuels failed:", err);
  }

  const durationMs = Date.now() - startedAt.getTime();
  state.lastPollDurationMs = durationMs;
  state.lastPollPendingCount = pending.length + duelPending;
  state.lastPollSentCount = sent + duelSent;
  state.lastPollFailedCount = failed + duelFailed;
  console.log(
    `[bot] poll done in ${durationMs}ms — events: pending=${pending.length} sent=${sent} failed=${failed} · duels: pending=${duelPending} sent=${duelSent} failed=${duelFailed}`
  );
  return {
    pending: pending.length + duelPending,
    sent: sent + duelSent,
    failed: failed + duelFailed,
    durationMs,
  };
}

async function persistDiscordGuildIdIfNeeded(
  appGuildId: string,
  channel: Channel | null
): Promise<void> {
  if (!channel || !("guild" in channel)) return;
  const discordGuild = (channel as { guild?: Guild }).guild;
  if (!discordGuild) return;
  try {
    await db
      .update(guilds)
      .set({ discordGuildId: discordGuild.id })
      .where(and(eq(guilds.id, appGuildId), isNull(guilds.discordGuildId)));
  } catch (err) {
    console.error("[bot] failed to persist discord_guild_id:", err);
  }
}

// ---- Test message API (called from /api/guilds/[id]/discord/test) ----

export type TestResult = { ok: true } | { ok: false; reason: string };

// Sends a one-off test message via Discord's REST API. Deliberately bypasses
// the gateway client / bot module state so the route handler doesn't depend
// on instrumentation having booted in the same Node module instance — only
// requires DISCORD_BOT_TOKEN to be readable from process.env.
export async function sendTestMessage(
  channelId: string,
  guildName: string,
  appGuildId?: string
): Promise<TestResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      ok: false,
      reason:
        "The Discord bot isn't running on this server (DISCORD_BOT_TOKEN not set).",
    };
  }

  const content = `Test message from **Foundation Event Organizer** — guild **${guildName}**. Your Discord integration is working. Event reminders will be sent here.`;

  // Post the message.
  const postRes = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
      }),
    }
  );
  if (!postRes.ok) {
    return { ok: false, reason: await translateDiscordError(postRes) };
  }

  // Auto-link Discord server ID by inspecting the channel.
  if (appGuildId) {
    try {
      const chRes = await fetch(
        `https://discord.com/api/v10/channels/${channelId}`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      if (chRes.ok) {
        const ch = (await chRes.json()) as { guild_id?: string };
        if (ch.guild_id) {
          await db
            .update(guilds)
            .set({ discordGuildId: ch.guild_id })
            .where(and(eq(guilds.id, appGuildId), isNull(guilds.discordGuildId)));
        }
      }
    } catch (err) {
      console.error("[bot] failed to persist discord_guild_id during test:", err);
    }
  }

  return { ok: true };
}

// ---- Scrim lifecycle notifications ----

export type ScrimNotifyAction =
  | "proposed"
  | "accepted"
  | "declined"
  | "cancelled";

type ScrimNotificationInput = {
  proposingGuildId: string;
  opposingGuildId: string;
  action: ScrimNotifyAction;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  // Public-facing app origin (e.g. https://foundation-event-organizer.fly.dev).
  // Used to render call-to-action links. Optional — messages just omit links
  // if not provided.
  appBaseUrl?: string;
  // For action="accepted": the per-guild mirrored event ids. Each guild's
  // post links to its own event so members can jump straight to sign up.
  proposingEventId?: string;
  opposingEventId?: string;
};

// Names of guilds that have a configured Discord channel but where the
// notification didn't reach Discord. Empty list = either everything posted
// successfully OR the affected guilds have no channel configured (which is
// the admin's intentional opt-out — not a warning condition).
export type ScrimNotifyOutcome = {
  failedGuildNames: string[];
};

// Posts a one-off scrim state-change message to each guild's configured
// Discord channel. Uses the REST API directly (mirrors sendTestMessage) so
// route handlers don't depend on the gateway client. Returns a per-guild
// outcome so callers can surface a soft warning when a configured channel
// failed to deliver. Never throws — a Discord outage must not break the
// scrim API.
export async function sendScrimNotification(
  input: ScrimNotificationInput
): Promise<ScrimNotifyOutcome> {
  const token = process.env.DISCORD_BOT_TOKEN;

  const [proposing, opposing] = await Promise.all([
    db.query.guilds.findFirst({
      where: and(eq(guilds.id, input.proposingGuildId), isNull(guilds.deletedAt)),
    }),
    db.query.guilds.findFirst({
      where: and(eq(guilds.id, input.opposingGuildId), isNull(guilds.deletedAt)),
    }),
  ]);
  if (!proposing || !opposing) return { failedGuildNames: [] };

  const targets = [proposing, opposing].filter(
    (g): g is typeof g & { discordChannelId: string } => !!g.discordChannelId
  );
  // Nothing configured — admins opted out, not a warning.
  if (targets.length === 0) return { failedGuildNames: [] };

  // No token = configured guilds can't be reached. Surface them as failures
  // so the admin sees the deployment-side problem.
  if (!token) {
    console.warn(
      "[bot] DISCORD_BOT_TOKEN not set — scrim notifications will not be sent"
    );
    return { failedGuildNames: targets.map((g) => g.name) };
  }

  // Message is composed per-guild so the accept notification can link each
  // side to its own mirrored event.
  const results = await Promise.all(
    targets.map(async (g) => {
      const eventId =
        g.id === input.proposingGuildId
          ? input.proposingEventId
          : input.opposingEventId;
      const eventSignupUrl =
        input.appBaseUrl && eventId
          ? `${input.appBaseUrl}/event/${eventId}`
          : null;
      const content = buildScrimMessage({
        action: input.action,
        proposingName: proposing.name,
        opposingName: opposing.name,
        proposedGameTime: input.proposedGameTime,
        location: input.location,
        winCondition: input.winCondition,
        appBaseUrl: input.appBaseUrl,
        eventSignupUrl,
      });
      const ok = await postScrimToChannel(
        token,
        g.discordChannelId,
        content,
        g.id
      );
      return { name: g.name, ok };
    })
  );
  return {
    failedGuildNames: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

async function postScrimToChannel(
  token: string,
  channelId: string,
  content: string,
  appGuildId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[bot] scrim notification failed guild=${appGuildId} channel=${channelId} status=${res.status} body=${body.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[bot] scrim notification fetch threw guild=${appGuildId} channel=${channelId}:`,
      err
    );
    return false;
  }
}

// Sends a direct message to a Discord user via the REST API. Two-step
// flow: open a DM channel with `recipient_id`, then post into it. Returns
// true on success. False on any failure (user has DMs disabled, user
// doesn't share a guild with the bot, transient API error) — never
// throws. Failures are logged at warn level.
async function sendDirectMessage(
  token: string,
  discordUserId: string,
  content: string
): Promise<boolean> {
  try {
    const channelRes = await fetch(
      `https://discord.com/api/v10/users/@me/channels`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient_id: discordUserId }),
      }
    );
    if (!channelRes.ok) {
      const body = await channelRes.text().catch(() => "");
      console.warn(
        `[bot] DM channel open failed user=${discordUserId} status=${channelRes.status} body=${body.slice(0, 200)}`
      );
      return false;
    }
    const channel = (await channelRes.json()) as { id: string };

    const postRes = await fetch(
      `https://discord.com/api/v10/channels/${channel.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] },
        }),
      }
    );
    if (!postRes.ok) {
      const body = await postRes.text().catch(() => "");
      // Discord code 50007 = "Cannot send messages to this user" — the
      // most common cause is that the user disabled DMs from server
      // members. Treated as a soft failure (caller logs but doesn't
      // surface to the actor).
      console.warn(
        `[bot] DM post failed user=${discordUserId} status=${postRes.status} body=${body.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[bot] DM fetch threw user=${discordUserId}:`, err);
    return false;
  }
}

// Looks up the linked Discord user ID for an app user. Returns null when
// the user hasn't signed in with Discord (or unlinked their Discord
// account). Pure DB read — cheap.
async function resolveDiscordUserId(
  appUserId: string
): Promise<string | null> {
  const row = await db
    .select({ providerAccountId: accounts.providerAccountId })
    .from(accounts)
    .where(
      and(eq(accounts.userId, appUserId), eq(accounts.provider, "discord"))
    )
    .get();
  return row?.providerAccountId ?? null;
}

function buildScrimMessage(args: {
  action: ScrimNotifyAction;
  proposingName: string;
  opposingName: string;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  appBaseUrl?: string;
  eventSignupUrl?: string | null;
}): string {
  const when = discordTimestamp(args.proposedGameTime, "F");
  const relative = discordTimestamp(args.proposedGameTime, "R");
  const proposer = `**${args.proposingName}**`;
  const opposer = `**${args.opposingName}**`;
  // Scrim management lives at /admin/scrimmages — there's no per-scrim
  // detail page, but that dashboard surfaces incoming proposals where the
  // opposing-side admin can accept or decline.
  const scrimUrl = args.appBaseUrl ? `${args.appBaseUrl}/admin/scrimmages` : null;
  if (args.action === "proposed") {
    const cta = scrimUrl
      ? `Guild admins can accept or decline at <${scrimUrl}>`
      : `${opposer} admins can accept or decline on the website.`;
    return [
      `**Scrim proposed** — ${proposer} has challenged ${opposer} to a scrim.`,
      `Time: ${when} (${relative})`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
      cta,
    ].join("\n");
  }
  if (args.action === "accepted") {
    const lines = [
      `**Scrim accepted** — ${opposer} accepted ${proposer}'s scrim challenge.`,
      `Time: ${when} (${relative})`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
    ];
    if (args.eventSignupUrl) {
      lines.push(`Sign up at <${args.eventSignupUrl}>`);
    }
    return lines.join("\n");
  }
  if (args.action === "cancelled") {
    return [
      `**Scrim cancelled** — The scrim between ${proposer} and ${opposer} (scheduled for ${when}) has been cancelled.`,
    ].join("\n");
  }
  // declined
  return [
    `**Scrim declined** — ${opposer} declined ${proposer}'s scrim challenge.`,
    `Was proposed for ${when}.`,
  ].join("\n");
}

// ---- Duel lifecycle notifications (1v1 player-vs-player) ----

export type DuelNotifyAction =
  | "proposed"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "edited"
  | "cancelled"
  | "result_declared"
  | "reminder";

type DuelNotificationInput = {
  proposingUserId: string;
  opposingUserId: string;
  action: DuelNotifyAction;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  duelId: string;
  appBaseUrl?: string;
  // When set, only this user receives the DM. Used by withdraw + edit
  // where the actor already knows what they did — only the OTHER side
  // needs to learn about the change. Unset = DM both players (default).
  targetUserId?: string;
  // For action="reminder": the lead-time bucket so the message body can
  // say "starts in 1 hour" / "starts in 20 minutes" / "starts tomorrow".
  reminderKind?: "day" | "hour" | "twenty_min";
};

export type DuelNotifyOutcome = {
  // In-game names of players the DM didn't reach (had Discord linked +
  // opted in, but Discord refused — usually because DMs are disabled).
  // Players without a linked Discord account or who opted out aren't
  // counted as failures.
  failedPlayerNames: string[];
};

// DMs each player about a duel state change. We use direct messages
// rather than guild-channel posts because duels are personal — a guild's
// other members don't need to see the play-by-play of every 1v1.
//
// A delivery attempt is made when:
//   1. The player has a linked Discord OAuth account (we have their ID).
//   2. The player has `duelDmEnabled = true` (default).
//   3. The bot has a token configured.
//
// Discord returns code 50007 "Cannot send messages to this user" when
// the recipient has DMs disabled; we log a warning and surface the name
// in `failedPlayerNames` so the caller can show a soft hint.
export async function sendDuelNotification(
  input: DuelNotificationInput
): Promise<DuelNotifyOutcome> {
  const token = process.env.DISCORD_BOT_TOKEN;

  const [proposing, opposing] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, input.proposingUserId) }),
    db.query.users.findFirst({ where: eq(users.id, input.opposingUserId) }),
  ]);
  if (!proposing || !opposing) return { failedPlayerNames: [] };

  if (!token) {
    console.warn(
      "[bot] DISCORD_BOT_TOKEN not set — duel DMs will not be sent"
    );
    return { failedPlayerNames: [] };
  }

  const content = buildDuelMessage({
    action: input.action,
    proposingName: proposing.inGameName ?? "A player",
    opposingName: opposing.inGameName ?? "Another player",
    proposedGameTime: input.proposedGameTime,
    location: input.location,
    winCondition: input.winCondition,
    duelId: input.duelId,
    appBaseUrl: input.appBaseUrl,
    reminderKind: input.reminderKind,
  });

  // Resolve both players' Discord IDs in parallel. Same player on both
  // sides is impossible (API rejects self-duels), so no dedup needed.
  // When targetUserId is set, we filter down to just that side.
  const failures: string[] = [];
  const allTargets = [
    { player: proposing, label: proposing.inGameName ?? "Proposer" },
    { player: opposing, label: opposing.inGameName ?? "Opponent" },
  ];
  const targets = input.targetUserId
    ? allTargets.filter((t) => t.player.id === input.targetUserId)
    : allTargets;

  await Promise.all(
    targets.map(async ({ player, label }) => {
      if (!player.duelDmEnabled) return; // opted out, silent
      const discordUserId = await resolveDiscordUserId(player.id);
      if (!discordUserId) return; // no linked Discord, silent
      const ok = await sendDirectMessage(token, discordUserId, content);
      if (!ok) failures.push(label);
    })
  );

  return { failedPlayerNames: failures };
}

function buildDuelMessage(args: {
  action: DuelNotifyAction;
  proposingName: string;
  opposingName: string;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  duelId: string;
  appBaseUrl?: string;
  reminderKind?: "day" | "hour" | "twenty_min";
}): string {
  const when = discordTimestamp(args.proposedGameTime, "F");
  const relative = discordTimestamp(args.proposedGameTime, "R");
  const proposer = `**${args.proposingName}**`;
  const opposer = `**${args.opposingName}**`;
  const duelUrl = args.appBaseUrl
    ? `${args.appBaseUrl}/duels/${args.duelId}`
    : null;

  if (args.action === "proposed") {
    const lines = [
      `**Duel proposed** — ${proposer} has challenged ${opposer} to a 1v1.`,
      `Time: ${when} (${relative})`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
    ];
    if (duelUrl) {
      lines.push(`${opposer} can accept or decline at <${duelUrl}>`);
    }
    return lines.join("\n");
  }
  if (args.action === "accepted") {
    const lines = [
      `**Duel accepted** — ${opposer} accepted ${proposer}'s 1v1 challenge.`,
      `Time: ${when} (${relative})`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
    ];
    if (duelUrl) lines.push(`Details: <${duelUrl}>`);
    return lines.join("\n");
  }
  if (args.action === "cancelled") {
    return [
      `**Duel cancelled** — The 1v1 between ${proposer} and ${opposer} (scheduled for ${when}) has been cancelled.`,
    ].join("\n");
  }
  if (args.action === "result_declared") {
    const lines = [
      `**Duel result declared** — The 1v1 between ${proposer} and ${opposer} (${when}) has a final result.`,
    ];
    if (duelUrl) lines.push(`See it at <${duelUrl}>`);
    return lines.join("\n");
  }
  if (args.action === "withdrawn") {
    return [
      `**Duel withdrawn** — ${proposer} withdrew their 1v1 challenge against ${opposer}.`,
      `Was proposed for ${when}.`,
    ].join("\n");
  }
  if (args.action === "edited") {
    const lines = [
      `**Duel updated** — ${proposer} updated their 1v1 challenge against ${opposer}.`,
      `Time: ${when} (${relative})`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
    ];
    if (duelUrl) {
      lines.push(`Review and accept or decline at <${duelUrl}>`);
    }
    return lines.join("\n");
  }
  if (args.action === "reminder") {
    // Lead-time phrasing scaled by which bucket fired this reminder.
    // Falls back to the relative timestamp if no bucket was provided.
    const lead =
      args.reminderKind === "twenty_min"
        ? "starts in 20 minutes"
        : args.reminderKind === "hour"
          ? "starts in about 1 hour"
          : args.reminderKind === "day"
            ? "starts tomorrow"
            : `starts ${relative}`;
    const lines = [
      `**Duel reminder** — Your 1v1 between ${proposer} and ${opposer} ${lead}.`,
      `Time: ${when}`,
      `Location: ${args.location}`,
      `Condition of Win: ${args.winCondition}`,
    ];
    if (duelUrl) lines.push(`Details: <${duelUrl}>`);
    return lines.join("\n");
  }
  // declined
  return [
    `**Duel declined** — ${opposer} declined ${proposer}'s 1v1 challenge.`,
    `Was proposed for ${when}.`,
  ].join("\n");
}

// ---- Guild join announcements ----

// Posts a "[name] has joined [TAG] — <join-link>" message to the guild's
// configured Discord channel after a user joins. Three preconditions
// (all silent skips if missed — never blocks the join API):
//
//   1. Guild has a discordChannelId set
//   2. Bot has a token
//   3. We can resolve OR generate a usable invite link
//
// For invite resolution we prefer the longest-lived existing invite
// (never-expires + unlimited-uses sort first). If none is usable, we
// auto-generate a permanent invite owned by the guild's creator so the
// announcement link is actually clickable. That invite is real and
// persists — admins can revoke it later from /admin/invites.
export async function sendGuildJoinAnnouncement(input: {
  guildId: string;
  joinedUserId: string;
  appBaseUrl: string;
}): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const [guild, joinedUser] = await Promise.all([
    db.query.guilds.findFirst({
      where: and(eq(guilds.id, input.guildId), isNull(guilds.deletedAt)),
    }),
    db.query.users.findFirst({ where: eq(users.id, input.joinedUserId) }),
  ]);
  if (!guild?.discordChannelId) return;
  if (!joinedUser?.inGameName) return; // no name to announce yet

  const inviteCode = await resolveOrCreatePermanentInvite(
    guild.id,
    guild.createdByUserId
  );
  if (!inviteCode) {
    // Couldn't get/create an invite — guild may be in a weird state.
    // Skip rather than post a broken link.
    return;
  }

  const tag = guild.tag ? `[${guild.tag}]` : guild.name;
  const joinUrl = `${input.appBaseUrl}/join/${inviteCode}`;
  const content = `**${joinedUser.inGameName}** has joined **${tag}** — <${joinUrl}>`;

  await postScrimToChannel(token, guild.discordChannelId, content, guild.id);
}

// Returns a usable invite code for the guild. If no existing invite is
// usable (expired, revoked, maxed out, or none at all), generates a new
// permanent one (never-expires, unlimited uses) attributed to the guild
// creator.
async function resolveOrCreatePermanentInvite(
  guildId: string,
  createdByUserId: string
): Promise<string | null> {
  const nowIso = new Date().toISOString();

  // Find any usable invite: not revoked, not expired, not at max uses.
  // Prefer permanent (null expiresAt + null maxUses) by sorting them
  // first via the SQL flags so they win when multiple match.
  const usable = await db
    .select()
    .from(guildInvites)
    .where(
      and(
        eq(guildInvites.guildId, guildId),
        isNull(guildInvites.revokedAt),
        or(isNull(guildInvites.expiresAt), gt(guildInvites.expiresAt, nowIso)),
        or(
          isNull(guildInvites.maxUses),
          sql`${guildInvites.usesCount} < ${guildInvites.maxUses}`
        )
      )
    )
    .orderBy(
      sql`${guildInvites.expiresAt} IS NULL DESC`,
      sql`${guildInvites.maxUses} IS NULL DESC`
    )
    .limit(1)
    .get();

  if (usable) return usable.code;

  // None usable — generate a permanent invite. Same code shape as the
  // admin-created invites (8 random bytes → base64url ≈ 11 chars).
  try {
    const code = randomBytes(8).toString("base64url");
    await db.insert(guildInvites).values({
      id: crypto.randomUUID(),
      guildId,
      code,
      createdByUserId,
      expiresAt: null,
      maxUses: null,
      usesCount: 0,
      createdAt: nowIso,
    });
    return code;
  } catch (err) {
    console.warn(
      `[bot] failed to auto-generate permanent invite for guild=${guildId}:`,
      err
    );
    return null;
  }
}

// ---- Event lifecycle notifications (match / simple) ----

export type EventNotifyAction = "created" | "updated" | "cancelled";

type EventNotificationInput = {
  guildId: string;
  eventId: string;
  eventName: string;
  action: EventNotifyAction;
  // For non-cancellation messages we include a link so members can jump
  // straight to the event page. Cancellation links would 404 (event is
  // soft-deleted), so callers omit it.
  eventUrl?: string;
  // Match: pass per-squad start times. Simple: pass gameTime. Used to render
  // the "Starts" line in the message body. Omit on cancellation.
  gameTime?: string | null;
  squad1Name?: string;
  squad2Name?: string;
  squad1StartsAt?: string | null;
  squad2StartsAt?: string | null;
};

// Posts an event lifecycle message to the guild's configured Discord channel.
// No-op if the guild has no channel set (intentional opt-out — not a warning
// condition). Failures are logged. Never throws.
export async function sendEventNotification(
  input: EventNotificationInput
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const guild = await db.query.guilds.findFirst({
    where: and(eq(guilds.id, input.guildId), isNull(guilds.deletedAt)),
  });
  if (!guild?.discordChannelId) return;

  const content = buildEventMessage(input);
  await postScrimToChannel(token, guild.discordChannelId, content, guild.id);
}

function buildEventMessage(args: EventNotificationInput): string {
  const headline =
    args.action === "created"
      ? `**New event: ${args.eventName}**`
      : args.action === "updated"
        ? `**Event updated: ${args.eventName}**`
        : `**Event cancelled: ${args.eventName}**`;

  const lines: string[] = [headline];

  if (args.action !== "cancelled") {
    if (args.gameTime) {
      const when = discordTimestamp(args.gameTime, "F");
      const relative = discordTimestamp(args.gameTime, "R");
      lines.push(`Starts: ${when} (${relative})`);
    }
    if (args.squad1StartsAt || args.squad2StartsAt) {
      const parts: string[] = [];
      if (args.squad1StartsAt) {
        parts.push(
          `${args.squad1Name ?? "Squad 1"}: ${discordTimestamp(args.squad1StartsAt, "F")}`
        );
      }
      if (args.squad2StartsAt) {
        parts.push(
          `${args.squad2Name ?? "Squad 2"}: ${discordTimestamp(args.squad2StartsAt, "F")}`
        );
      }
      lines.push(parts.join(" · "));
    }
    if (args.eventUrl) {
      // Angle brackets suppress Discord's auto-embed preview, keeping the
      // message compact.
      lines.push(`Sign up: <${args.eventUrl}>`);
    }
  }

  return lines.join("\n");
}

// Discord timestamp tokens: <t:UNIX:STYLE> renders in each viewer's local
// timezone. F = "Saturday, May 11, 2024 2:00 PM"; R = "in 3 hours".
function discordTimestamp(iso: string, style: "F" | "R"): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

async function translateDiscordError(res: Response): Promise<string> {
  let body: { code?: number; message?: string } | null = null;
  try {
    body = (await res.json()) as { code?: number; message?: string };
  } catch {
    /* ignore */
  }
  const code = body?.code;
  if (code === 50001)
    return "Bot doesn't have access to that channel. Make sure it's been added to the server.";
  if (code === 50013)
    return "Bot is missing the Send Messages permission for that channel.";
  if (code === 10003)
    return "That channel ID doesn't exist (or the bot can't see it).";
  if (res.status === 401)
    return "DISCORD_BOT_TOKEN is invalid. Regenerate the token in the Discord developer portal.";
  return body?.message ?? `Discord API returned ${res.status}.`;
}

// ---- Slash command handlers ----

async function handleChatCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const startMs = Date.now();
  const cmd = interaction.commandName;
  const userId = interaction.user.id;

  // Discord gives 3s to acknowledge an interaction. Defer immediately so DB
  // queries (and any cold-start work) can run without blowing the budget.
  // Handlers below use editReply() to fill in the response.
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error(`[bot] deferReply failed for ${cmd} user=${userId}:`, err);
    return;
  }

  try {
    if (cmd === "upcoming") {
      await handleUpcoming(interaction);
    } else if (cmd === "signup") {
      await handleSignup(interaction);
    }
    console.log(
      `[bot] command ${cmd} done user=${userId} in ${Date.now() - startMs}ms`
    );
  } catch (err) {
    console.error(
      `[bot] command error ${cmd} user=${userId} after ${Date.now() - startMs}ms:`,
      err
    );
    await interaction.editReply("Something went wrong.").catch(() => {});
  }
}

// Discord gives autocomplete 3 seconds total — no deferReply available. We
// race the DB query against this budget so a slow disk degrades to "No
// options" instead of "Loading options failed". Set conservatively below the
// hard limit to leave room for the response round-trip.
const AUTOCOMPLETE_BUDGET_MS = 2500;

async function handleAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const startMs = Date.now();
  console.log(
    `[bot] autocomplete received cmd=${interaction.commandName} guild=${interaction.guildId}`
  );
  try {
    if (interaction.commandName !== "signup") return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "event") return;

    const appGuildId = await resolveAppGuildId(interaction.guildId);
    if (!appGuildId) {
      console.log(
        `[bot] autocomplete: no app guild linked to discord guild ${interaction.guildId}`
      );
      await interaction.respond([]);
      return;
    }

    // Race the load against Discord's budget. If the DB is slow (e.g. WAL
    // recovery on cold start, disk I/O lag), we still respond within budget.
    const upcoming = await Promise.race([
      loadUpcomingEvents(appGuildId),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), AUTOCOMPLETE_BUDGET_MS)
      ),
    ]);
    if (upcoming === "timeout") {
      console.warn(
        `[bot] autocomplete timed out after ${Date.now() - startMs}ms guild=${appGuildId}`
      );
      await interaction.respond([]);
      return;
    }

    const query = focused.value.toLowerCase();
    const matches = upcoming
      .filter((e) => e.name.toLowerCase().includes(query))
      .slice(0, 25);

    await interaction.respond(
      matches.map((e) => ({
        name: truncateChoice(
          `${e.kind === "scrim" ? "[Scrim] " : ""}${e.name} — ${formatShort(e.earliestStart)}`
        ),
        value: e.id,
      }))
    );
    console.log(
      `[bot] autocomplete done guild=${appGuildId} upcoming=${upcoming.length} matches=${matches.length} in ${Date.now() - startMs}ms`
    );
  } catch (err) {
    // Unhandled exceptions here cause Discord's "Loading options failed"
    // banner. Log the cause, then respond with an empty list so the user
    // sees "No options" instead of a generic failure splash.
    console.error(
      `[bot] autocomplete error after ${Date.now() - startMs}ms guild=${interaction.guildId}:`,
      err
    );
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => {});
    }
  }
}

// Discord caps slash command choice names at 100 characters.
function truncateChoice(s: string): string {
  return s.length <= 100 ? s : s.slice(0, 97) + "…";
}

async function handleUpcoming(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    await interaction.editReply(notConfiguredMessage());
    return;
  }

  const upcoming = await loadUpcomingEvents(appGuildId);
  if (upcoming.length === 0) {
    await interaction.editReply("No upcoming events.");
    return;
  }

  const lines = upcoming
    .slice(0, 10)
    .map((e) => {
      if (e.kind === "scrim") {
        const when = e.gameTime ? formatShort(e.gameTime) : "TBD";
        return `• **${e.name}** (scrim) — ${when}`;
      }
      const s1 = e.squad1StartsAt ? formatShort(e.squad1StartsAt) : "TBD";
      const s2 = e.squad2StartsAt ? formatShort(e.squad2StartsAt) : "TBD";
      return `• **${e.name}** — ${e.squad1Name}: ${s1} · ${e.squad2Name}: ${s2}`;
    })
    .join("\n");
  await interaction.editReply(`**Upcoming events**\n${lines}`);
}

async function handleSignup(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  // Squad is now optional — defaults to Squad 1 if omitted, and is ignored
  // entirely for scrim events (which have only one squad).
  const squad = interaction.options.getInteger("squad", false) ?? 1;
  const willingBackup = interaction.options.getBoolean("willing_backup") ?? true;

  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    await interaction.editReply(notConfiguredMessage());
    return;
  }

  const appUser = await resolveAppUserFromDiscord(interaction.user.id);
  if (!appUser) {
    await interaction.editReply(
      "Connect your Discord account first by signing in to the website with Discord, then try `/signup` again."
    );
    return;
  }

  // Look up the event so we know its kind. Scrims store no squad2 row, so
  // we send squad1Preference=1, squad2Preference=null. Matches keep the
  // user's pick.
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    await interaction.editReply("Event not found.");
    return;
  }
  const isScrim = event.kind === "scrim";

  const result = createSignup({
    membership: {
      userId: appUser.id,
      guildId: appUser.guildId,
      isSuperAdmin: appUser.isSuperAdmin,
    },
    input: {
      eventId,
      userId: appUser.id,
      squad1Preference: isScrim ? 1 : squad === 1 ? 1 : 2,
      squad2Preference: isScrim ? null : squad === 1 ? 2 : 1,
      willingBackup,
      requestLeadership: false,
      leadershipNote: null,
    },
  });

  if (!result.ok) {
    await interaction.editReply(`Couldn't sign you up: ${result.reason}`);
    return;
  }

  await interaction.editReply(
    result.waitlisted
      ? "You're on the waitlist — squads were full when you signed up. You'll be promoted automatically if a slot opens."
      : "You're signed up. See you on the field."
  );
}

// ---- Helpers ----

async function resolveAppGuildId(
  discordGuildId: string | null
): Promise<string | null> {
  if (!discordGuildId) return null;
  const row = await db.query.guilds.findFirst({
    where: and(
      eq(guilds.discordGuildId, discordGuildId),
      isNull(guilds.deletedAt)
    ),
  });
  return row?.id ?? null;
}

async function resolveAppUserFromDiscord(
  discordUserId: string
): Promise<{ id: string; guildId: string | null; isSuperAdmin: boolean } | null> {
  const row = await db
    .select({
      id: users.id,
      guildId: users.guildId,
      isSuperAdmin: users.isSuperAdmin,
    })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(
      and(
        eq(accounts.provider, "discord"),
        eq(accounts.providerAccountId, discordUserId)
      )
    )
    .get();
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guildId ?? null,
    isSuperAdmin: row.isSuperAdmin === true,
  };
}

type UpcomingSignupEvent = {
  id: string;
  name: string;
  kind: "match" | "scrim";
  squad1Name: string;
  squad2Name: string;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
  gameTime: string | null;
  earliestStart: string;
};

// Returns match + scrim events for the guild whose earliest scheduled start
// is in the future. Sorted by earliest start ascending. Used by /upcoming
// and /signup autocomplete. Simple events are excluded — they have no
// signup form.
async function loadUpcomingEvents(
  appGuildId: string
): Promise<UpcomingSignupEvent[]> {
  const nowIso = new Date().toISOString();
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      kind: events.kind,
      squad1Name: events.squad1Name,
      squad2Name: events.squad2Name,
      squad1StartsAt: events.squad1StartsAt,
      squad2StartsAt: events.squad2StartsAt,
      gameTime: events.gameTime,
    })
    .from(events)
    .where(
      and(
        eq(events.guildId, appGuildId),
        inArray(events.kind, ["match", "scrim"]),
        isNull(events.deletedAt)
      )
    );

  const upcoming: UpcomingSignupEvent[] = [];
  for (const r of rows) {
    // Scrim events carry a single start in gameTime (matches set
    // squad1StartsAt / squad2StartsAt). Consider all available timestamps so
    // a missing one doesn't drop the event.
    const futureStarts = [
      r.squad1StartsAt,
      r.squad2StartsAt,
      r.gameTime,
    ].filter((v): v is string => !!v && v > nowIso);
    if (futureStarts.length === 0) continue;
    const earliestStart = futureStarts.reduce((a, b) => (a < b ? a : b));
    upcoming.push({
      ...r,
      kind: r.kind as "match" | "scrim",
      earliestStart,
    });
  }
  upcoming.sort((a, b) => a.earliestStart.localeCompare(b.earliestStart));
  return upcoming;
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function notConfiguredMessage(): string {
  return [
    "This Discord server isn't linked to a guild yet. An app admin needs to:",
    "1. Open Guild Settings on the website.",
    "2. Paste this channel's Discord channel ID.",
    "3. Click **Test integration**. That auto-links the server.",
  ].join("\n");
}
