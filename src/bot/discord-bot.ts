import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  type APIActionRowComponent,
  type APIButtonComponentWithURL,
  type APIEmbed,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Channel,
  type Guild,
  type RESTPostAPIApplicationCommandsJSONBody,
  type TextChannel,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { accounts, events, guildInvites, guilds, signups, users } from "@/db/schema";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  buildMessage,
  buildVoiceDmMessage,
  findPending,
  recordSent,
  type LocalizedTranslator,
  type NotificationTarget,
} from "@/lib/notifications";
import {
  findPendingDuels,
  recordSentDuel,
} from "@/lib/duel-notifications";
import { createSignup } from "@/lib/signups";
import { logAudit, resolveActorDisplay } from "@/lib/audit";
import {
  getBotTranslator,
  resolveBotLocale,
  type BotTranslator,
} from "@/bot/i18n";
import { isSupportedLocale, locales, localeLabels } from "@/i18n/config";

// 1-minute poll cadence — matches the 1-minute notification windows.
const POLL_INTERVAL_MS = 60 * 1000;

// Operator-visible heartbeat channel. Each poll cycle posts a one-line
// summary here so we can spot silent gateway drops (the bot looks alive
// but reminders stop firing). If this stream goes quiet, the bot is dead.
const HEARTBEAT_CHANNEL_ID = "1503976552629796954";

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

// Per-user boolean preferences exposed by /settings. Adding a new toggle is
// (a) a new entry here, (b) a new column on the users table, (c) the
// downstream code reading it. The slash command registration and the
// view/set handlers are driven by this list.
type BoolSettingKey = "voiceDmEnabled";

type BoolSetting = {
  // /settings <subcommand> — lowercase, underscore-separated.
  subcommand: string;
  // i18n key (relative to the `bot` namespace) for the human label shown in
  // /settings replies. Localized per caller via the bot translator.
  labelKey: string;
  // users-table column name (Drizzle property).
  key: BoolSettingKey;
  // One-line description for command registration. English-only — Discord's
  // command schema is registered once at startup and isn't re-localized per
  // user. (Discord supports description_localizations but that's not wired
  // up yet.)
  description: string;
};

const BOOL_SETTINGS: readonly BoolSetting[] = [
  {
    subcommand: "voice_invites",
    labelKey: "settings.labels.voiceInvites",
    key: "voiceDmEnabled",
    description:
      "Receive a DM ~10 min before each match with a join link to your squad's voice channel",
  },
];

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
  {
    name: "settings",
    description: "View or change your notification preferences",
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: "view",
        description: "Show your current notification preferences",
        type: ApplicationCommandOptionType.Subcommand,
      },
      ...BOOL_SETTINGS.map((s) => ({
        name: s.subcommand,
        description: s.description,
        type: ApplicationCommandOptionType.Subcommand as const,
        options: [
          {
            name: "enabled",
            description: "true = receive; false = mute",
            type: ApplicationCommandOptionType.Boolean as const,
            required: true,
          },
        ],
      })),
    ],
  },
  {
    name: "locale",
    description: "View or change the language the bot uses to talk to you",
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: "view",
        description: "Show your current language preference",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "set",
        description: "Set your preferred language",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "code",
            description: "Language to use",
            type: ApplicationCommandOptionType.String,
            required: true,
            // Choices fit within Discord's 25-per-option cap (we currently
            // support 17 locales — see src/i18n/config.ts).
            choices: locales.map((code) => ({
              name: localeLabels[code],
              value: code,
            })),
          },
        ],
      },
      {
        name: "clear",
        description: "Clear your language preference (auto-detect will be used)",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
];

export function startBot(): void {
  const state = getState();
  if (state.started) return;
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[bot] DISCORD_BOT_TOKEN not set — skipping bot startup.");
    return;
  }
  state.started = true;

  // `GuildMembers` is a privileged intent — must also be toggled ON in the
  // Discord Developer Portal (your bot → Bot → "Server Members Intent").
  // Required for the onboarding-import flow that lists server members so
  // admins can match in-game names to Discord accounts. If the toggle is
  // off, the gateway connection fails at identify-time with "Disallowed
  // intent" — surface as a clear startup error rather than silently broken
  // member-list features.
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
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
    // Heartbeat even on skip — the channel listener cares "is the bot
    // running?", and a skip reason is itself useful signal. Only path that
    // can't heartbeat is `not-ready` (no client to send through).
    if (reason !== "not-ready" && state.client?.isReady()) {
      void sendHeartbeat(state.client, `skipped (${reason})`);
    }
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
    if (p.kind === "voice_dm") {
      try {
        const outcome = await dispatchVoiceDms(p);
        sent++;
        console.log(
          `[bot] voice_dm event=${p.eventId} squad=${p.squadNumber} assigned=${outcome.assigned} dmEligible=${outcome.eligible} dmSent=${outcome.dmSent} dmFailed=${outcome.dmFailed}`
        );
      } catch (err) {
        failed++;
        console.error(
          `[bot] voice_dm dispatch failed event=${p.eventId} squad=${p.squadNumber}:`,
          err
        );
      }
      continue;
    }
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
      const appBaseUrl = resolveAppBaseUrl();
      const components =
        appBaseUrl && p.kind !== "end_thirty_min" && p.kind !== "end_five_min"
          ? linkButtonRow(
              p.eventKind === "simple" ? "Event Info" : "Sign up",
              `${appBaseUrl}/event/${p.eventId}`,
              "🔗"
            )
          : [];
      await (channel as TextChannel).send({
        content: buildMessage(p),
        components,
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
  void sendHeartbeat(
    client,
    `${durationMs}ms · events p=${pending.length} s=${sent} f=${failed} · duels p=${duelPending} s=${duelSent} f=${duelFailed}`
  );
  return {
    pending: pending.length + duelPending,
    sent: sent + duelSent,
    failed: failed + duelFailed,
    durationMs,
  };
}

// One-line heartbeat to HEARTBEAT_CHANNEL_ID. Fire-and-forget — failures
// here must never break the poll loop. Discord `<t:UNIX:T>` renders in the
// viewer's local timezone, so the same message reads correctly for any
// operator watching the channel.
async function sendHeartbeat(client: Client, summary: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(HEARTBEAT_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      console.warn(
        `[bot] heartbeat channel ${HEARTBEAT_CHANNEL_ID} not text-based; skipping`
      );
      return;
    }
    const ts = Math.floor(Date.now() / 1000);
    await (channel as TextChannel).send({
      content: `\u{1FAC0} poll <t:${ts}:T> · ${summary}`,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[bot] heartbeat post failed:", err);
  }
}

async function persistDiscordGuildIdIfNeeded(
  appGuildId: string,
  channel: Channel | null
): Promise<void> {
  if (!channel || !("guild" in channel)) return;
  const discordGuild = (channel as { guild?: Guild }).guild;
  if (!discordGuild) return;
  try {
    // Unconditional refresh — the previous `isNull(discordGuildId)` guard
    // meant a stale value (from a moved-bot or partial earlier setup) never
    // self-healed even though the poll loop has all the information needed.
    await db
      .update(guilds)
      .set({ discordGuildId: discordGuild.id })
      .where(eq(guilds.id, appGuildId));
  } catch (err) {
    console.error("[bot] failed to persist discord_guild_id:", err);
  }
}

// ---- Test message API (called from /api/guilds/[id]/discord/test) ----

// `link` reports the auto-link half of Test Integration. It's separate from
// `ok` because the message post can succeed while the channel-info fetch (or
// the DB update) silently fails — admins need to know about that, because
// without a correct `discord_guild_id` the slash commands stay broken even
// though reminders work.
export type TestResult =
  | {
      ok: true;
      link:
        | { ok: true; discordGuildId: string; changed: boolean }
        | { ok: false; reason: string };
    }
  | { ok: false; reason: string };

// Sends a one-off test message via Discord's REST API. Deliberately bypasses
// the gateway client / bot module state so the route handler doesn't depend
// on instrumentation having booted in the same Node module instance — only
// requires DISCORD_BOT_TOKEN to be readable from process.env.
export async function sendTestMessage(
  channelId: string,
  guildName: string,
  appGuildId?: string
): Promise<TestResult> {
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      ok: false,
      reason:
        "The Discord bot isn't running on this server (DISCORD_BOT_TOKEN not set).",
    };
  }

  const testEmbed: APIEmbed = {
    title: "✅ Integration working",
    description: `This is a test message from **Rally Up** for guild **${guildName}**. Event reminders will be posted here.`,
    color: EMBED_COLORS.success,
    footer: { text: "Rally Up" },
    timestamp: new Date().toISOString(),
  };

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
        content: "",
        embeds: [testEmbed],
        components: [],
        allowed_mentions: { parse: [] },
      }),
    }
  );
  if (!postRes.ok) {
    return { ok: false, reason: await translateDiscordError(postRes) };
  }

  // Auto-link the Discord server ID by inspecting the channel. Always
  // overwrites the stored value — the previous `isNull(discordGuildId)`
  // guard meant that once a wrong/stale value was in the DB (e.g. the bot
  // was moved to a different Discord server, or the original auto-link
  // partially failed), Test Integration silently never repaired it.
  // Re-running Test Integration is now the way to refresh the link.
  let link:
    | { ok: true; discordGuildId: string; changed: boolean }
    | { ok: false; reason: string };
  if (!appGuildId) {
    link = { ok: false, reason: "App guild ID not supplied — skipping auto-link." };
  } else {
    try {
      const chRes = await fetch(
        `https://discord.com/api/v10/channels/${channelId}`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      if (!chRes.ok) {
        link = {
          ok: false,
          reason: `Channel info fetch failed (${chRes.status}). Bot may lack View Channel permission.`,
        };
      } else {
        const ch = (await chRes.json()) as { guild_id?: string };
        if (!ch.guild_id) {
          link = { ok: false, reason: "Channel response had no guild_id (DM channel?)." };
        } else {
          const existing = await db.query.guilds.findFirst({
            where: eq(guilds.id, appGuildId),
            columns: { discordGuildId: true },
          });
          const changed = existing?.discordGuildId !== ch.guild_id;
          await db
            .update(guilds)
            .set({ discordGuildId: ch.guild_id })
            .where(eq(guilds.id, appGuildId));
          link = { ok: true, discordGuildId: ch.guild_id, changed };
        }
      }
    } catch (err) {
      console.error("[bot] auto-link failed during test:", err);
      link = {
        ok: false,
        reason: err instanceof Error ? err.message : "Unknown error during auto-link.",
      };
    }
  }

  return { ok: true, link };
}

// ---- Voice-DM test (admin-triggered from Guild Settings) ----

export type VoiceTestResult =
  | { ok: true; discordUserId: string }
  | { ok: false; reason: string };

// Sends a one-off DM to the caller (the admin clicking "Test DM" in Guild
// Settings) containing a clickable join link to the supplied voice channel.
// Two-purpose: verifies (a) the channel ID renders to something joinable and
// (b) the bot can DM this admin (= they have a linked Discord account and
// haven't blocked DMs from server members). Both are preconditions for the
// production voice_dm reminder, so a successful test means the real reminder
// will at least reach this admin.
export async function sendVoiceTestDm(args: {
  adminUserId: string;
  channelId: string;
  squadLabel: string;
}): Promise<VoiceTestResult> {
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      ok: false,
      reason: "The Discord bot isn't running on this server (DISCORD_BOT_TOKEN not set).",
    };
  }

  const discordUserId = await resolveDiscordUserId(args.adminUserId);
  if (!discordUserId) {
    return {
      ok: false,
      reason:
        "You don't have a Discord account linked. Sign in with Discord on the website (or enter your Discord user ID on the /me page), then try again.",
    };
  }

  // Render the DM body in the admin's selected language. Falls back to
  // English if they haven't set one — Discord's interaction.locale isn't
  // available here (this path is fired from the website, not Discord).
  const adminLocaleRow = await db.query.users.findFirst({
    where: eq(users.id, args.adminUserId),
    columns: { locale: true },
  });
  const adminLocale = resolveBotLocale(adminLocaleRow?.locale ?? null, null);
  const t = await getBotTranslator(adminLocale);

  const content = t("voiceDm.test", {
    squadLabel: args.squadLabel,
    channelId: args.channelId,
  });
  const ok = await sendDirectMessage(token, discordUserId, content);
  if (!ok) {
    return {
      ok: false,
      reason:
        "Discord refused to deliver the DM. Common causes: you haven't joined the Discord server with the bot, or you've disabled DMs from server members (User Settings → Privacy & Safety).",
    };
  }
  return { ok: true, discordUserId };
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
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;

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
      const post = buildScrimPost({
        action: input.action,
        proposingName: proposing.name,
        opposingName: opposing.name,
        proposedGameTime: input.proposedGameTime,
        location: input.location,
        winCondition: input.winCondition,
        appBaseUrl: input.appBaseUrl,
        eventSignupUrl,
      });
      const ok = await postToChannel(
        token,
        g.discordChannelId,
        post,
        g.id
      );
      return { name: g.name, ok };
    })
  );
  return {
    failedGuildNames: results.filter((r) => !r.ok).map((r) => r.name),
  };
}

type ChannelPost = {
  content?: string;
  embeds?: APIEmbed[];
  components?: APIActionRowComponent<APIButtonComponentWithURL>[];
};

async function postToChannel(
  token: string,
  channelId: string,
  post: ChannelPost,
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
          content: post.content ?? "",
          embeds: post.embeds ?? [],
          components: post.components ?? [],
          allowed_mentions: { parse: [] },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[bot] channel post failed guild=${appGuildId} channel=${channelId} status=${res.status} body=${body.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[bot] channel post fetch threw guild=${appGuildId} channel=${channelId}:`,
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

// Shape of a Discord server member as returned from the list endpoint.
// `nick` is the server-specific nickname (often null); `global_name` is
// the user's account-wide display name (formerly known as the username
// post-pomelo migration). All three identity fields may be considered
// when fuzzy-matching to in-game names.
export type DiscordGuildMember = {
  userId: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
};

export type FetchMembersResult =
  | { ok: true; members: DiscordGuildMember[] }
  | {
      ok: false;
      reason:
        | "no-token"
        | "intent-disabled"
        | "bot-not-in-server"
        | "http-error";
      detail?: string;
    };

// Lists every member of a Discord server via the REST API. Requires the
// app to have the privileged `Server Members Intent` enabled in the
// Discord Developer Portal — without it, Discord returns 403 / 400 with a
// `code: 50000`-family error. We don't lean on the gateway cache because
// (a) the cache is only populated after gateway-side member chunks arrive,
// which is a separate flow, and (b) the REST path works statelessly.
//
// Pagination: Discord caps each page at 1000 members. We loop with the
// `?after=<lastId>` cursor until a short page comes back. For >5000-member
// servers this could be slow but is still bounded — and the use case
// (small-to-medium gaming guilds) sits well below that.
export async function fetchGuildMembers(
  discordGuildId: string
): Promise<FetchMembersResult> {
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, reason: "no-token" };

  const members: DiscordGuildMember[] = [];
  let after: string | null = null;
  const PAGE_SIZE = 1000;

  // Hard ceiling so a misconfigured server can't pull us into an infinite
  // loop. 50K members covers every realistic Rally Up customer.
  const MAX_MEMBERS = 50_000;

  while (members.length < MAX_MEMBERS) {
    const url = new URL(
      `https://discord.com/api/v10/guilds/${discordGuildId}/members`
    );
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (after) url.searchParams.set("after", after);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bot ${token}` },
      });
    } catch (err) {
      console.warn(
        `[bot] fetchGuildMembers threw guild=${discordGuildId}:`,
        err
      );
      return { ok: false, reason: "http-error", detail: String(err) };
    }

    if (res.status === 404) {
      return { ok: false, reason: "bot-not-in-server" };
    }
    if (res.status === 403 || res.status === 401) {
      const body = await res.text().catch(() => "");
      // Discord doesn't expose a clean error code for "you forgot to
      // enable the privileged intent" — surface a friendly hint.
      console.warn(
        `[bot] fetchGuildMembers ${res.status} guild=${discordGuildId} body=${body.slice(0, 200)}`
      );
      return {
        ok: false,
        reason: "intent-disabled",
        detail: "Enable 'Server Members Intent' in the Discord Developer Portal for this bot, then redeploy.",
      };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[bot] fetchGuildMembers ${res.status} guild=${discordGuildId} body=${body.slice(0, 200)}`
      );
      return { ok: false, reason: "http-error", detail: body.slice(0, 200) };
    }

    type RawMember = {
      user: {
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      };
      nick: string | null;
    };
    const page = (await res.json()) as RawMember[];
    for (const m of page) {
      if (!m.user) continue;
      members.push({
        userId: m.user.id,
        username: m.user.username,
        globalName: m.user.global_name,
        nick: m.nick,
        avatarUrl: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
          : null,
      });
    }
    if (page.length < PAGE_SIZE) break;
    after = page[page.length - 1].user.id;
  }

  return { ok: true, members };
}

// Sends an onboarding DM to a Discord user who's been added as a stub
// member by an admin. The recipient clicks the sign-in link, OAuths via
// Discord, and the existing auto-claim flow in src/auth.ts merges the
// stub by matching their snowflake. Returns true on success.
export async function sendOnboardingDm(args: {
  discordUserId: string;
  guildName: string;
  signInUrl: string;
}): Promise<boolean> {
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;
  const content = [
    `Hey — an admin from **${args.guildName}** added you to their Rally Up roster.`,
    ``,
    `Sign in with Discord to claim your account and join match nights: <${args.signInUrl}>`,
    ``,
    `_If you weren't expecting this, you can ignore the message — nothing happens until you sign in._`,
  ].join("\n");
  return sendDirectMessage(token, args.discordUserId, content);
}

// Sends per-user voice-channel DMs for one squad of one match event. Called
// from runOnce after the (eventId, squad, "voice_dm") idempotency row is
// reserved — that reservation is one-shot, so a transient Discord outage
// will not retry. Failures are per-user and only logged; the broader poll
// loop is unaffected.
//
// Skips silently when:
//   - No one is assigned to the squad yet (admin hasn't run squad assignment).
//   - A signed-up user has no linked Discord account (DM target unknown).
//   - DISCORD_BOT_TOKEN isn't configured on this machine.
async function dispatchVoiceDms(p: NotificationTarget): Promise<{
  assigned: number;
  eligible: number;
  dmSent: number;
  dmFailed: number;
}> {
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token || !p.voiceChannelId) {
    return { assigned: 0, eligible: 0, dmSent: 0, dmFailed: 0 };
  }

  // Join users so we can respect the per-user voiceDmEnabled opt-out and
  // pick up users.locale (for DM localization) without extra round-trips.
  // We still count the full assigned squad in metrics so admins can spot
  // "everyone opted out" separately from "no one assigned yet".
  const rows = await db
    .select({
      userId: signups.userId,
      voiceDmEnabled: users.voiceDmEnabled,
      locale: users.locale,
    })
    .from(signups)
    .innerJoin(users, eq(users.id, signups.userId))
    .where(
      and(
        eq(signups.eventId, p.eventId),
        eq(signups.assignedSquad, p.squadNumber),
        isNull(signups.deletedAt)
      )
    );

  const assigned = rows.length;
  let eligible = 0;
  let dmSent = 0;
  let dmFailed = 0;

  for (const r of rows) {
    if (!r.voiceDmEnabled) continue; // opted out — silent skip
    const discordUserId = await resolveDiscordUserId(r.userId);
    if (!discordUserId) continue; // not Discord-linked — silent skip
    eligible++;
    // Per-recipient localization. The translator is cached inside
    // src/bot/i18n.ts so repeat locales don't re-load the bundle.
    const recipientLocale = resolveBotLocale(r.locale, null);
    const t = await getBotTranslator(recipientLocale);
    const content = buildVoiceDmMessage(p, t);
    const ok = await sendDirectMessage(token, discordUserId, content);
    if (ok) dmSent++;
    else dmFailed++;
  }

  return { assigned, eligible, dmSent, dmFailed };
}

// Looks up the Discord user ID for an app user. Prefers users.discord_user_id
// (the canonical source — populated automatically on Discord sign-in via
// the auth.ts signIn event, OR manually entered on /me by Google-signup
// users). Falls back to the legacy accounts-table lookup for users who
// linked Discord before the column existed and haven't signed in again.
// Pure DB read — cheap.
async function resolveDiscordUserId(
  appUserId: string
): Promise<string | null> {
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, appUserId),
    columns: { discordUserId: true },
  });
  if (userRow?.discordUserId) return userRow.discordUserId;

  // Legacy fallback — pre-column Discord-OAuth users still have their
  // ID in the accounts table from the initial sign-in. Going forward
  // the signIn event mirrors it to users.discord_user_id.
  const accountRow = await db
    .select({ providerAccountId: accounts.providerAccountId })
    .from(accounts)
    .where(
      and(eq(accounts.userId, appUserId), eq(accounts.provider, "discord"))
    )
    .get();
  return accountRow?.providerAccountId ?? null;
}

function buildScrimPost(args: {
  action: ScrimNotifyAction;
  proposingName: string;
  opposingName: string;
  proposedGameTime: string;
  location: string;
  winCondition: string;
  appBaseUrl?: string;
  eventSignupUrl?: string | null;
}): ChannelPost {
  const unix = Math.floor(new Date(args.proposedGameTime).getTime() / 1000);
  const scrimUrl = args.appBaseUrl ? `${args.appBaseUrl}/admin/scrimmages` : null;

  if (args.action === "proposed") {
    const embed: APIEmbed = {
      title: "⚔️ Scrim Proposed",
      description: `**${args.proposingName}** has challenged **${args.opposingName}** to a scrim.`,
      color: EMBED_COLORS.warning,
      fields: [
        { name: "🕐 Time", value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
        { name: "📍 Location", value: args.location, inline: true },
        { name: "🏆 Condition of Win", value: args.winCondition, inline: true },
      ],
      footer: { text: "Rally Up · Guild admins can accept or decline on the website" },
      timestamp: args.proposedGameTime,
    };
    return {
      embeds: [embed],
      components: scrimUrl ? linkButtonRow("Manage Scrimmages", scrimUrl, "🛡️") : [],
    };
  }

  if (args.action === "accepted") {
    const embed: APIEmbed = {
      title: "✅ Scrim Accepted",
      description: `**${args.opposingName}** accepted **${args.proposingName}**'s scrim challenge.`,
      color: EMBED_COLORS.success,
      fields: [
        { name: "🕐 Time", value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
        { name: "📍 Location", value: args.location, inline: true },
        { name: "🏆 Condition of Win", value: args.winCondition, inline: true },
      ],
      footer: { text: "Rally Up" },
      timestamp: args.proposedGameTime,
    };
    return {
      embeds: [embed],
      components: args.eventSignupUrl
        ? linkButtonRow("Sign up", args.eventSignupUrl, "🔗")
        : [],
    };
  }

  if (args.action === "cancelled") {
    const embed: APIEmbed = {
      title: "❌ Scrim Cancelled",
      description: `The scrim between **${args.proposingName}** and **${args.opposingName}** has been cancelled.`,
      color: EMBED_COLORS.neutral,
      fields: [
        { name: "Was scheduled for", value: `<t:${unix}:F>`, inline: false },
      ],
      footer: { text: "Rally Up" },
    };
    return { embeds: [embed] };
  }

  // declined
  const embed: APIEmbed = {
    title: "❌ Scrim Declined",
    description: `**${args.opposingName}** declined **${args.proposingName}**'s scrim challenge.`,
    color: EMBED_COLORS.neutral,
    fields: [
      { name: "Was proposed for", value: `<t:${unix}:F>`, inline: false },
    ],
    footer: { text: "Rally Up" },
  };
  return { embeds: [embed] };
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
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;

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
      // Per-recipient locale: build the body in each player's language.
      // The translator cache amortizes repeated lookups.
      const recipientLocale = resolveBotLocale(player.locale, null);
      const tDuel = await getBotTranslator(recipientLocale);
      const content = buildDuelMessage(
        {
          action: input.action,
          proposingName: proposing.inGameName ?? "A player",
          opposingName: opposing.inGameName ?? "Another player",
          proposedGameTime: input.proposedGameTime,
          location: input.location,
          winCondition: input.winCondition,
          duelId: input.duelId,
          appBaseUrl: input.appBaseUrl,
          reminderKind: input.reminderKind,
        },
        tDuel
      );
      const ok = await sendDirectMessage(token, discordUserId, content);
      if (!ok) failures.push(label);
    })
  );

  return { failedPlayerNames: failures };
}

function buildDuelMessage(
  args: {
    action: DuelNotifyAction;
    proposingName: string;
    opposingName: string;
    proposedGameTime: string;
    location: string;
    winCondition: string;
    duelId: string;
    appBaseUrl?: string;
    reminderKind?: "day" | "hour" | "twenty_min";
  },
  t: LocalizedTranslator
): string {
  const when = discordTimestamp(args.proposedGameTime, "F");
  const relative = discordTimestamp(args.proposedGameTime, "R");
  const proposer = `**${args.proposingName}**`;
  const opposer = `**${args.opposingName}**`;
  const duelUrl = args.appBaseUrl
    ? `${args.appBaseUrl}/duels/${args.duelId}`
    : null;

  if (args.action === "proposed") {
    const lines = [
      t("duel.proposedHeading", { proposer, opposer }),
      t("duel.timeLine", { when, relative }),
      t("duel.locationLine", { location: args.location }),
      t("duel.winConditionLine", { winCondition: args.winCondition }),
    ];
    if (duelUrl) lines.push(t("duel.ctaProposed", { opposer, duelUrl }));
    return lines.join("\n");
  }
  if (args.action === "accepted") {
    const lines = [
      t("duel.acceptedHeading", { proposer, opposer }),
      t("duel.timeLine", { when, relative }),
      t("duel.locationLine", { location: args.location }),
      t("duel.winConditionLine", { winCondition: args.winCondition }),
    ];
    if (duelUrl) lines.push(t("duel.ctaAccepted", { duelUrl }));
    return lines.join("\n");
  }
  if (args.action === "cancelled") {
    return t("duel.cancelled", { proposer, opposer, when });
  }
  if (args.action === "result_declared") {
    const lines = [t("duel.resultDeclaredHeading", { proposer, opposer, when })];
    if (duelUrl) lines.push(t("duel.ctaResult", { duelUrl }));
    return lines.join("\n");
  }
  if (args.action === "withdrawn") {
    return [
      t("duel.withdrawnHeading", { proposer, opposer }),
      t("duel.wasProposedFor", { when }),
    ].join("\n");
  }
  if (args.action === "edited") {
    const lines = [
      t("duel.editedHeading", { proposer, opposer }),
      t("duel.timeLine", { when, relative }),
      t("duel.locationLine", { location: args.location }),
      t("duel.winConditionLine", { winCondition: args.winCondition }),
    ];
    if (duelUrl) lines.push(t("duel.ctaEdited", { duelUrl }));
    return lines.join("\n");
  }
  if (args.action === "reminder") {
    // Lead-time phrasing scaled by which bucket fired this reminder.
    // Falls back to the relative timestamp if no bucket was provided.
    const lead =
      args.reminderKind === "twenty_min"
        ? t("duel.leadTwentyMin")
        : args.reminderKind === "hour"
          ? t("duel.leadHour")
          : args.reminderKind === "day"
            ? t("duel.leadDay")
            : t("duel.leadDefault", { relative });
    const lines = [
      t("duel.reminderHeading", { proposer, opposer, lead }),
      t("duel.timeLineNoRelative", { when }),
      t("duel.locationLine", { location: args.location }),
      t("duel.winConditionLine", { winCondition: args.winCondition }),
    ];
    if (duelUrl) lines.push(t("duel.ctaReminder", { duelUrl }));
    return lines.join("\n");
  }
  // declined
  return [
    t("duel.declinedHeading", { proposer, opposer }),
    t("duel.wasProposedFor", { when }),
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
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
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
  const joinEmbed: APIEmbed = {
    title: `👋 ${joinedUser.inGameName} has joined ${tag}`,
    color: EMBED_COLORS.success,
    footer: { text: "Rally Up" },
    timestamp: new Date().toISOString(),
  };
  await postToChannel(
    token,
    guild.discordChannelId,
    { embeds: [joinEmbed], components: linkButtonRow("Join the guild", joinUrl) },
    guild.id
  );
}

// Returns a usable invite code for the guild. If no existing invite is
// usable (expired, revoked, maxed out, or none at all), generates a new
// permanent one (never-expires, unlimited uses) attributed to the guild
// creator. If the creator's account was deleted (`createdByUserId` null),
// falls back to any current admin so we still have a valid FK target;
// if no admin exists, skips generation and returns null.
async function resolveOrCreatePermanentInvite(
  guildId: string,
  createdByUserId: string | null
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
  // admin-created invites (8 random bytes → base64url ≈ 11 chars). The
  // FK on guild_invites.created_by_user_id is NOT NULL, so if the founder
  // is gone we pick any current admin as the attribution; if none, skip.
  let attributedUserId = createdByUserId;
  if (!attributedUserId) {
    const fallbackAdmin = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.guildId, guildId), eq(users.guildRole, "admin")))
      .limit(1)
      .get();
    attributedUserId = fallbackAdmin?.id ?? null;
  }
  if (!attributedUserId) return null;

  try {
    const code = randomBytes(8).toString("base64url");
    await db.insert(guildInvites).values({
      id: crypto.randomUUID(),
      guildId,
      code,
      createdByUserId: attributedUserId,
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
  eventKind?: EventKind;
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
  const token = process.env.DISCORD_BETA_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const guild = await db.query.guilds.findFirst({
    where: and(eq(guilds.id, input.guildId), isNull(guilds.deletedAt)),
  });
  if (!guild?.discordChannelId) return;

  const post = buildEventPost(input);
  await postToChannel(token, guild.discordChannelId, post, guild.id);
}

function buildEventPost(args: EventNotificationInput): ChannelPost {
  const isCancelled = args.action === "cancelled";
  const prefix =
    args.action === "created"
      ? "📅 New event"
      : args.action === "updated"
        ? "✏️ Event updated"
        : "🗑️ Event cancelled";

  const lines: string[] = [`${prefix}: **${args.eventName}**`];

  if (!isCancelled) {
    if (args.gameTime) {
      const unix = Math.floor(new Date(args.gameTime).getTime() / 1000);
      lines.push(`⏰ Starts <t:${unix}:R> — <t:${unix}:F>`);
    }
    if (args.squad1StartsAt) {
      const unix = Math.floor(new Date(args.squad1StartsAt).getTime() / 1000);
      lines.push(`📍 ${args.squad1Name ?? "Squad 1"}: <t:${unix}:F>`);
    }
    if (args.squad2StartsAt) {
      const unix = Math.floor(new Date(args.squad2StartsAt).getTime() / 1000);
      lines.push(`📍 ${args.squad2Name ?? "Squad 2"}: <t:${unix}:F>`);
    }
  }

  return {
    content: lines.join("\n"),
    components:
      !isCancelled && args.eventUrl
        ? linkButtonRow(
            args.eventKind === "simple" ? "Event Info" : "Sign up",
            args.eventUrl,
            "🔗"
          )
        : [],
  };
}

// Discord timestamp tokens: <t:UNIX:STYLE> renders in each viewer's local
// timezone. F = "Saturday, May 11, 2024 2:00 PM"; R = "in 3 hours".
function discordTimestamp(iso: string, style: "F" | "f" | "R"): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// ---- Discord embed helpers ----

const EMBED_COLORS = {
  match: 0x7c3aed,   // violet
  scrim: 0xe11d48,   // rose
  simple: 0x2563eb,  // blue
  success: 0x059669, // emerald
  warning: 0xd97706, // amber
  neutral: 0x6b7280, // gray
  danger: 0xdc2626,  // red
} as const;

const KIND_EMOJI: Record<"match" | "simple" | "scrim", string> = {
  match: "⚔️",
  scrim: "🏟️",
  simple: "📅",
};

// Wraps a single link button in an action row — the only component type we
// use. Returns an array so callers can spread into `components: []` directly.
function linkButtonRow(
  label: string,
  url: string,
  emoji?: string
): APIActionRowComponent<APIButtonComponentWithURL>[] {
  const btn: APIButtonComponentWithURL = {
    type: 2,  // Button
    style: 5, // Link
    label,
    url,
    ...(emoji ? { emoji: { name: emoji } } : {}),
  };
  return [{ type: 1, components: [btn] }];
}

// Reads the canonical app origin from the Auth.js env var that Fly and
// Vercel set automatically. Strips trailing slash. Falls back to null when
// running locally without that var — callers omit buttons gracefully.
function resolveAppBaseUrl(): string | null {
  const raw = process.env.AUTH_URL ?? process.env.APP_URL ?? null;
  return raw ? raw.replace(/\/$/, "") : null;
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

  // Resolve the caller's locale once per invocation: users.locale (set on
  // the website) wins, falling back to Discord's interaction.locale (their
  // Discord client language), then to English. A single small lookup —
  // missing on first-time Discord users is fine, just hits the fallback.
  const localeRow = await db
    .select({ locale: users.locale })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(
      and(
        eq(accounts.provider, "discord"),
        eq(accounts.providerAccountId, userId)
      )
    )
    .get();
  const locale = resolveBotLocale(localeRow?.locale ?? null, interaction.locale);
  const t = await getBotTranslator(locale);

  try {
    if (cmd === "upcoming") {
      await handleUpcoming(interaction, t);
    } else if (cmd === "signup") {
      await handleSignup(interaction, t);
    } else if (cmd === "settings") {
      await handleSettings(interaction, t);
    } else if (cmd === "locale") {
      await handleLocale(interaction, t);
    }
    console.log(
      `[bot] command ${cmd} done user=${userId} in ${Date.now() - startMs}ms`
    );
  } catch (err) {
    console.error(
      `[bot] command error ${cmd} user=${userId} after ${Date.now() - startMs}ms:`,
      err
    );
    await interaction.editReply(t("common.error")).catch(() => {});
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
        `[bot] autocomplete: no app guild linked — ${discordCtx(interaction)}`
      );
      await interaction.respond([]);
      return;
    }

    // Race the load against Discord's budget. If the DB is slow (e.g. WAL
    // recovery on cold start, disk I/O lag), we still respond within budget.
    const upcoming = await Promise.race([
      // Autocomplete only suggests signable events — picking a simple event
      // here would fail downstream in createSignup.
      loadUpcomingEvents(appGuildId, ["match", "scrim"]),
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
  interaction: ChatInputCommandInteraction,
  t: BotTranslator
): Promise<void> {
  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    console.warn(
      `[bot] /upcoming: no app guild linked — ${discordCtx(interaction)}`
    );
    await interaction.editReply(t("common.notConfigured"));
    return;
  }

  const upcoming = await loadUpcomingEvents(appGuildId);
  if (upcoming.length === 0) {
    // Diagnostic breakdown: distinguishes "guild has no events at all" from
    // "guild has events but none are upcoming match/scrim" so operators can
    // tell whether the user needs to create an event or set a start time.
    const guild = await db.query.guilds.findFirst({
      where: eq(guilds.id, appGuildId),
      columns: { slug: true, name: true },
    });
    const totalsRow = await db
      .select({
        total: sql<number>`count(*)`,
        liveMatchOrScrim: sql<number>`sum(case when ${events.deletedAt} is null and ${events.kind} in ('match','scrim') then 1 else 0 end)`,
      })
      .from(events)
      .where(eq(events.guildId, appGuildId))
      .get();
    console.warn(
      `[bot] /upcoming: empty — ${discordCtx(interaction)} ` +
        `app_guild=${appGuildId} slug=${guild?.slug ?? "?"} "${guild?.name ?? "?"}" ` +
        `events_total=${totalsRow?.total ?? 0} live_match_or_scrim=${totalsRow?.liveMatchOrScrim ?? 0}`
    );
    await interaction.editReply(t("upcoming.empty"));
    return;
  }

  const tbd = t("common.tbd");
  const fields: APIEmbed["fields"] = upcoming.slice(0, 10).map((e) => {
    const emoji = KIND_EMOJI[e.kind as "match" | "scrim" | "simple"] ?? "📅";
    if (e.kind === "scrim") {
      const unix = e.gameTime ? Math.floor(new Date(e.gameTime).getTime() / 1000) : null;
      return {
        name: `${emoji} ${e.name}`,
        value: unix ? `<t:${unix}:f>` : tbd,
        inline: false,
      };
    }
    if (e.kind === "simple") {
      const unix = e.gameTime ? Math.floor(new Date(e.gameTime).getTime() / 1000) : null;
      return {
        name: `${emoji} ${e.name}`,
        value: unix ? `<t:${unix}:f>` : tbd,
        inline: false,
      };
    }
    // match
    const s1unix = e.squad1StartsAt ? Math.floor(new Date(e.squad1StartsAt).getTime() / 1000) : null;
    const s2unix = e.squad2StartsAt ? Math.floor(new Date(e.squad2StartsAt).getTime() / 1000) : null;
    const s1 = s1unix ? `<t:${s1unix}:f>` : tbd;
    const s2 = s2unix ? `<t:${s2unix}:f>` : tbd;
    return {
      name: `${emoji} ${e.name}`,
      value: `${e.squad1Name}: ${s1}\n${e.squad2Name}: ${s2}`,
      inline: false,
    };
  });

  const upcomingEmbed: APIEmbed = {
    title: t("upcoming.heading"),
    color: EMBED_COLORS.match,
    fields,
    footer: { text: "Rally Up" },
  };
  await interaction.editReply({ embeds: [upcomingEmbed] });
}

async function handleSignup(
  interaction: ChatInputCommandInteraction,
  t: BotTranslator
): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  // Squad is now optional — defaults to Squad 1 if omitted, and is ignored
  // entirely for scrim events (which have only one squad).
  const squad = interaction.options.getInteger("squad", false) ?? 1;
  const willingBackup = interaction.options.getBoolean("willing_backup") ?? true;

  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    console.warn(
      `[bot] /signup: no app guild linked — ${discordCtx(interaction)}`
    );
    await interaction.editReply(t("common.notConfigured"));
    return;
  }

  const appUser = await resolveAppUserFromDiscord(interaction.user.id);
  if (!appUser) {
    await interaction.editReply(t("common.notLinked", { command: "signup" }));
    return;
  }

  // Look up the event so we know its kind. Scrims store no squad2 row, so
  // we send squad1Preference=1, squad2Preference=null. Matches keep the
  // user's pick.
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    await interaction.editReply(t("signup.eventNotFound"));
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
    await interaction.editReply(t("signup.failed", { reason: result.reason }));
    return;
  }

  const signupEmbed: APIEmbed = result.waitlisted
    ? {
        title: `⏳ ${t("signup.waitlisted")}`,
        color: EMBED_COLORS.warning,
        footer: { text: "Rally Up" },
      }
    : {
        title: `✅ ${t("signup.success")}`,
        color: EMBED_COLORS.success,
        footer: { text: "Rally Up" },
      };
  await interaction.editReply({ embeds: [signupEmbed] });
}

// Driven by the BOOL_SETTINGS registry — adding a new toggle there auto-
// extends both the command registration and the view/set flow here. The
// caller is authenticated by Discord (interaction.user.id is signed) and
// resolved to an app user via the OAuth-linked accounts table only, so
// someone who manually entered another user's Discord ID on /me can't
// invoke /settings as that user.
async function handleSettings(
  interaction: ChatInputCommandInteraction,
  t: BotTranslator
): Promise<void> {
  const appUser = await resolveAppUserFromDiscord(interaction.user.id);
  if (!appUser) {
    await interaction.editReply(t("common.notLinked", { command: "settings" }));
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  if (sub === "view") {
    await handleSettingsView(interaction, appUser.id, t);
    return;
  }

  const setting = BOOL_SETTINGS.find((s) => s.subcommand === sub);
  if (!setting) {
    await interaction.editReply(t("settings.unknown"));
    return;
  }

  const enabled = interaction.options.getBoolean("enabled", true);
  const before = await db.query.users.findFirst({
    where: eq(users.id, appUser.id),
    columns: { guildId: true, voiceDmEnabled: true },
  });

  await db
    .update(users)
    .set({ [setting.key]: enabled })
    .where(eq(users.id, appUser.id));

  await interaction.editReply(
    t("settings.changed", {
      label: t(setting.labelKey),
      state: t(enabled ? "common.on" : "common.off"),
    })
  );

  // Audit log for parity with the website /api/me path — preference flips
  // are user-level, so guildId is best-effort (their current guild if any).
  void logAudit({
    guildId: before?.guildId ?? null,
    actorUserId: appUser.id,
    actorDisplay: await resolveActorDisplay(appUser.id),
    action: "user.update",
    entityType: "user",
    entityId: appUser.id,
    entityLabel: appUser.id,
    changes: {
      before: { [setting.key]: (before as Record<string, unknown> | undefined)?.[setting.key] },
      after: { [setting.key]: enabled },
    },
  });
}

async function handleSettingsView(
  interaction: ChatInputCommandInteraction,
  appUserId: string,
  t: BotTranslator
): Promise<void> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, appUserId),
    columns: { voiceDmEnabled: true },
  });
  if (!row) {
    await interaction.editReply(t("settings.loadFailed"));
    return;
  }
  const lines = [t("settings.viewHeading")];
  for (const s of BOOL_SETTINGS) {
    const v = (row as Record<string, unknown>)[s.key] as boolean | undefined;
    lines.push(
      t("settings.viewLine", {
        label: t(s.labelKey),
        state: t(v ? "common.on" : "common.off"),
      })
    );
  }
  lines.push("", t("settings.viewFooter"));
  await interaction.editReply(lines.join("\n"));
}

// /locale — view / set / clear the user's stored language preference. Set
// replies in the *new* locale so users get instant confirmation in the
// language they just picked. Audit-logged for parity with the website's
// /api/me path.
async function handleLocale(
  interaction: ChatInputCommandInteraction,
  t: BotTranslator
): Promise<void> {
  const appUser = await resolveAppUserFromDiscord(interaction.user.id);
  if (!appUser) {
    await interaction.editReply(t("common.notLinked", { command: "locale" }));
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "view") {
    const row = await db.query.users.findFirst({
      where: eq(users.id, appUser.id),
      columns: { locale: true },
    });
    const stored = row?.locale ?? null;
    if (stored && isSupportedLocale(stored)) {
      await interaction.editReply(
        t("locale.viewCurrent", { label: localeLabels[stored], code: stored })
      );
    } else {
      await interaction.editReply(t("locale.viewAuto"));
    }
    return;
  }

  if (sub === "set") {
    const code = interaction.options.getString("code", true);
    if (!isSupportedLocale(code)) {
      // Discord enforces the choice list, but defend against a stale client
      // sending an old code we've since dropped.
      await interaction.editReply(t("locale.unsupported", { code }));
      return;
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, appUser.id),
      columns: { guildId: true, locale: true },
    });

    await db
      .update(users)
      .set({ locale: code })
      .where(eq(users.id, appUser.id));

    // Reply in the new locale so users get instant feedback in the language
    // they just picked.
    const newT = await getBotTranslator(code);
    await interaction.editReply(
      newT("locale.set", { label: localeLabels[code], code })
    );

    void logAudit({
      guildId: before?.guildId ?? null,
      actorUserId: appUser.id,
      actorDisplay: await resolveActorDisplay(appUser.id),
      action: "user.update",
      entityType: "user",
      entityId: appUser.id,
      entityLabel: appUser.id,
      changes: {
        before: { locale: before?.locale ?? null },
        after: { locale: code },
      },
    });
    return;
  }

  if (sub === "clear") {
    const before = await db.query.users.findFirst({
      where: eq(users.id, appUser.id),
      columns: { guildId: true, locale: true },
    });

    await db
      .update(users)
      .set({ locale: null })
      .where(eq(users.id, appUser.id));

    // After clearing, resolveBotLocale falls back to interaction.locale,
    // then to English. Render the confirmation in that fallback so we don't
    // confirm the change in a language the user can't read.
    const fallbackLocale = resolveBotLocale(null, interaction.locale);
    const newT = await getBotTranslator(fallbackLocale);
    await interaction.editReply(newT("locale.cleared"));

    void logAudit({
      guildId: before?.guildId ?? null,
      actorUserId: appUser.id,
      actorDisplay: await resolveActorDisplay(appUser.id),
      action: "user.update",
      entityType: "user",
      entityId: appUser.id,
      entityLabel: appUser.id,
      changes: {
        before: { locale: before?.locale ?? null },
        after: { locale: null },
      },
    });
    return;
  }
}

// ---- Helpers ----

// Compact identifier block for bot log lines. Always includes the Discord
// guild snowflake + name (when available) and the invoking user's snowflake
// so an operator can map a "no events for my guild" report back to a row
// in the DB without rerunning the command.
function discordCtx(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction
): string {
  const dGuildId = interaction.guildId ?? "(dm)";
  const dGuildName = interaction.guild?.name ?? "(unknown)";
  return `discord_guild=${dGuildId} "${dGuildName}" user=${interaction.user.id}`;
}

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

type EventKind = "match" | "scrim" | "simple";

type UpcomingSignupEvent = {
  id: string;
  name: string;
  kind: EventKind;
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
// `/upcoming` displays all event kinds for the guild; `/signup`'s autocomplete
// narrows to signable kinds (match + scrim) so users can't pick an info-only
// event and hit the "this event does not accept signups" error.
async function loadUpcomingEvents(
  appGuildId: string,
  kinds: readonly EventKind[] = ["match", "scrim", "simple"]
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
        inArray(events.kind, kinds),
        isNull(events.deletedAt)
      )
    );

  const upcoming: UpcomingSignupEvent[] = [];
  for (const r of rows) {
    // Scrim + simple events carry a single start in gameTime; matches use
    // squad1StartsAt / squad2StartsAt. Consider all available timestamps so a
    // missing one doesn't drop the event.
    const futureStarts = [
      r.squad1StartsAt,
      r.squad2StartsAt,
      r.gameTime,
    ].filter((v): v is string => !!v && v > nowIso);
    if (futureStarts.length === 0) continue;
    const earliestStart = futureStarts.reduce((a, b) => (a < b ? a : b));
    upcoming.push({
      ...r,
      kind: r.kind as EventKind,
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

