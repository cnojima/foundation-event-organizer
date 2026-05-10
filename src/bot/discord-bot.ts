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
import { db } from "@/db";
import { accounts, events, guilds, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  buildMessage,
  findPending,
  recordSent,
  type NotificationTarget,
} from "@/lib/notifications";
import { createSignup } from "@/lib/signups";

// 5-minute poll cadence — small enough to never miss a notification window
// (smallest window is 25 min wide), large enough that DB pressure is trivial.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Bot state on globalThis so the singleton survives Next.js compiling the
// same module into multiple chunks (instrumentation.ts and route handlers
// can otherwise end up with separate module instances and therefore
// separate `started`/`client` flags).
type BotState = { client: Client | null; started: boolean };
const STATE_KEY = Symbol.for("foundation.discord-bot.state");
type GlobalWithBot = typeof globalThis & { [STATE_KEY]?: BotState };

function getState(): BotState {
  const g = globalThis as GlobalWithBot;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { client: null, started: false };
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
    description: "Sign up for an upcoming match event",
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
        description: "Your first-choice squad (1 or 2)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
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
    console.log(`[bot] Logged in as ${client.user?.tag}`);
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

  client.on("error", (err) => {
    console.error("[bot] client error:", err);
  });

  void client.login(token).catch((err) => {
    console.error("[bot] login failed:", err);
    state.started = false;
    state.client = null;
  });
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

async function runOnce(): Promise<void> {
  const { client } = getState();
  if (!client?.isReady()) return;

  let pending: NotificationTarget[];
  try {
    pending = await findPending();
  } catch (err) {
    console.error("[bot] findPending failed:", err);
    return;
  }
  if (pending.length === 0) return;

  for (const p of pending) {
    if (!recordSent(p.eventId, p.squadNumber, p.kind)) continue;
    try {
      const channel = await client.channels.fetch(p.channelId);
      await persistDiscordGuildIdIfNeeded(p.guildId, channel);
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        console.warn(
          `[bot] channel ${p.channelId} for guild ${p.guildId} is not text-based; skipping`
        );
        continue;
      }
      await (channel as TextChannel).send({
        content: buildMessage(p),
        allowedMentions: { parse: ["everyone"] },
      });
      console.log(
        `[bot] notified event=${p.eventId} squad=${p.squadNumber} kind=${p.kind} channel=${p.channelId}`
      );
    } catch (err) {
      console.error(
        `[bot] post failed event=${p.eventId} squad=${p.squadNumber} kind=${p.kind} channel=${p.channelId}:`,
        err
      );
    }
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
  try {
    if (interaction.commandName === "upcoming") {
      await handleUpcoming(interaction);
    } else if (interaction.commandName === "signup") {
      await handleSignup(interaction);
    }
  } catch (err) {
    console.error(`[bot] command error ${interaction.commandName}:`, err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Something went wrong.").catch(() => {});
    } else {
      await interaction
        .reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
}

async function handleAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  if (interaction.commandName !== "signup") return;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "event") return;

  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    await interaction.respond([]);
    return;
  }

  const upcoming = await loadUpcomingEvents(appGuildId);
  const query = focused.value.toLowerCase();
  const matches = upcoming
    .filter((e) => e.name.toLowerCase().includes(query))
    .slice(0, 25);

  await interaction.respond(
    matches.map((e) => ({
      name: truncateChoice(`${e.name} — ${formatShort(e.earliestStart)}`),
      value: e.id,
    }))
  );
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
    await interaction.reply({
      content: notConfiguredMessage(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const upcoming = await loadUpcomingEvents(appGuildId);
  if (upcoming.length === 0) {
    await interaction.reply({
      content: "No upcoming events.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = upcoming
    .slice(0, 10)
    .map((e) => {
      const s1 = e.squad1StartsAt ? formatShort(e.squad1StartsAt) : "TBD";
      const s2 = e.squad2StartsAt ? formatShort(e.squad2StartsAt) : "TBD";
      return `• **${e.name}** — ${e.squad1Name}: ${s1} · ${e.squad2Name}: ${s2}`;
    })
    .join("\n");
  await interaction.reply({
    content: `**Upcoming events**\n${lines}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSignup(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const eventId = interaction.options.getString("event", true);
  const squad = interaction.options.getInteger("squad", true);
  const willingBackup = interaction.options.getBoolean("willing_backup") ?? true;

  const appGuildId = await resolveAppGuildId(interaction.guildId);
  if (!appGuildId) {
    await interaction.reply({
      content: notConfiguredMessage(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const appUser = await resolveAppUserFromDiscord(interaction.user.id);
  if (!appUser) {
    await interaction.reply({
      content:
        "Connect your Discord account first by signing in to the website with Discord, then try `/signup` again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = createSignup({
    membership: {
      userId: appUser.id,
      guildId: appUser.guildId,
      isSuperAdmin: appUser.isSuperAdmin,
    },
    input: {
      eventId,
      userId: appUser.id,
      squad1Preference: squad === 1 ? 1 : 2,
      squad2Preference: squad === 1 ? 2 : 1,
      willingBackup,
      requestLeadership: false,
      leadershipNote: null,
    },
  });

  if (!result.ok) {
    await interaction.reply({
      content: `Couldn't sign you up: ${result.reason}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: result.waitlisted
      ? "You're on the waitlist — squads were full when you signed up. You'll be promoted automatically if a slot opens."
      : "You're signed up. See you on the field.",
    flags: MessageFlags.Ephemeral,
  });
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

type UpcomingMatchEvent = {
  id: string;
  name: string;
  squad1Name: string;
  squad2Name: string;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
  earliestStart: string;
};

// Returns match events for the guild whose earliest scheduled squad start is
// in the future. Sorted by earliest start ascending. Used by /upcoming and
// /signup autocomplete.
async function loadUpcomingEvents(appGuildId: string): Promise<UpcomingMatchEvent[]> {
  const nowIso = new Date().toISOString();
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      squad1Name: events.squad1Name,
      squad2Name: events.squad2Name,
      squad1StartsAt: events.squad1StartsAt,
      squad2StartsAt: events.squad2StartsAt,
    })
    .from(events)
    .where(
      and(
        eq(events.guildId, appGuildId),
        eq(events.kind, "match"),
        isNull(events.deletedAt)
      )
    );

  const upcoming: UpcomingMatchEvent[] = [];
  for (const r of rows) {
    const futureStarts = [r.squad1StartsAt, r.squad2StartsAt].filter(
      (v): v is string => !!v && v > nowIso
    );
    if (futureStarts.length === 0) continue;
    const earliestStart = futureStarts.reduce((a, b) => (a < b ? a : b));
    upcoming.push({ ...r, earliestStart });
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
