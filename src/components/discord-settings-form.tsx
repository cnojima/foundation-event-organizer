"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

// Discord OAuth install URL for the Event Organizer bot. The client_id is the
// app's Discord application ID — fixed per deployment, embedded here so the
// CTA works without a per-guild env lookup. permissions=133120 covers
// Send Messages + Mention Everyone (required for @everyone reminders).
const BOT_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1502013027858387054&scope=bot+applications.commands&permissions=133120";

// Standalone card for Discord integration: bot-invite CTA, channel ID,
// test-integration button. Saves the channel ID independently of the main
// guild settings form via PATCH /api/guilds/[id] (partial update).
export function DiscordSettingsForm({
  guildId,
  defaultDiscordChannelId,
  defaultSquad1VoiceChannelId,
  defaultSquad2VoiceChannelId,
}: {
  guildId: string;
  defaultDiscordChannelId: string;
  defaultSquad1VoiceChannelId: string;
  defaultSquad2VoiceChannelId: string;
}) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(defaultDiscordChannelId);
  const [squad1VoiceId, setSquad1VoiceId] = useState(defaultSquad1VoiceChannelId);
  const [squad2VoiceId, setSquad2VoiceId] = useState(defaultSquad2VoiceChannelId);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  type VoiceTestState =
    | { status: "idle" }
    | { status: "testing" }
    | { status: "ok" }
    | { status: "error"; reason: string };
  const [voice1Test, setVoice1Test] = useState<VoiceTestState>({ status: "idle" });
  const [voice2Test, setVoice2Test] = useState<VoiceTestState>({ status: "idle" });

  async function handleVoiceTest(
    squadNumber: 1 | 2,
    value: string,
    set: (s: VoiceTestState) => void
  ) {
    set({ status: "testing" });
    const res = await fetch(`/api/guilds/${guildId}/discord/voice-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: value.trim(),
        squadLabel: `Squad ${squadNumber}`,
      }),
    });
    if (res.ok) {
      set({ status: "ok" });
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      set({ status: "error", reason: data.error ?? "Test failed." });
    }
  }

  const [testing, setTesting] = useState(false);
  type LinkResult =
    | { ok: true; discordGuildId: string; changed: boolean }
    | { ok: false; reason: string };
  const [testResult, setTestResult] = useState<
    | { ok: true; link?: LinkResult }
    | { ok: false; reason: string }
    | null
  >(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discordChannelId: channelId.trim() || null,
        squad1VoiceChannelId: squad1VoiceId.trim() || null,
        squad2VoiceChannelId: squad2VoiceId.trim() || null,
      }),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    const res = await fetch(`/api/guilds/${guildId}/discord/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordChannelId: channelId.trim() || null }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        link?: LinkResult;
      };
      setTestResult({ ok: true, link: data.link });
    } else {
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: false, reason: data?.error ?? "Test failed." });
    }
    setTesting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Discord integration
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Post event reminders and enable <code>/upcoming</code> /{" "}
            <code>/signup</code> slash commands in your Discord server.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Step 1.</strong> Add the bot to your Discord server. You need
          the <em>Manage Server</em> permission there.
        </p>
        <a
          href={BOT_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Invite Event Organizer Discord Bot
          <ExternalLinkIcon />
        </a>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          <strong>Step 2.</strong> Discord channel ID
        </label>
        <div className="flex items-center gap-2">
          <input
            name="discordChannelId"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 123456789012345678"
            className="flex-1 border rounded px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !channelId.trim()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {testing ? "Testing..." : "Test integration"}
          </button>
        </div>
        <FieldHelp>
          The bot will post @everyone reminders here 1 day, 1 hour, and 20
          minutes before each event. Leave blank to disable. Enable Developer
          Mode in Discord (User Settings → Advanced), then right-click the
          channel → Copy Channel ID. Test sends a one-off message — no
          @everyone ping.
        </FieldHelp>
        {testResult?.ok && (
          <div className="mt-1 space-y-1 text-sm">
            <p className="text-emerald-700 dark:text-emerald-300">
              Test message sent. Check the channel.
            </p>
            {testResult.link?.ok && (
              <p className="text-emerald-700 dark:text-emerald-300">
                {testResult.link.changed
                  ? "Server link refreshed — slash commands should work now."
                  : "Server link confirmed — slash commands enabled."}{" "}
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  (Discord server ID: {testResult.link.discordGuildId})
                </span>
              </p>
            )}
            {testResult.link && !testResult.link.ok && (
              <p className="text-amber-700 dark:text-amber-300">
                Reminders will work, but slash commands won&apos;t — couldn&apos;t
                auto-link the Discord server: {testResult.link.reason}
              </p>
            )}
          </div>
        )}
        {testResult && !testResult.ok && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-300">{testResult.reason}</p>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Squad voice channels <span className="font-normal text-gray-500 dark:text-gray-400">(match events only)</span>
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Optional. When set, the bot DMs each assigned squadmate ~10
            minutes before kickoff with a clickable join link. Only users who
            have signed in with Discord will receive a DM. Click <strong>Test DM</strong> to send yourself a sample join link — verifies the channel ID and your own DM deliverability.
          </p>
        </div>
        <VoiceChannelRow
          squadNumber={1}
          value={squad1VoiceId}
          onChange={setSquad1VoiceId}
          testState={voice1Test}
          onTest={() => handleVoiceTest(1, squad1VoiceId, setVoice1Test)}
        />
        <VoiceChannelRow
          squadNumber={2}
          value={squad2VoiceId}
          onChange={setSquad2VoiceId}
          testState={voice2Test}
          onTest={() => handleVoiceTest(2, squad2VoiceId, setVoice2Test)}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Discord settings"}
        </button>
        {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-300">Saved.</span>}
      </div>
    </form>
  );
}

function VoiceChannelRow({
  squadNumber,
  value,
  onChange,
  testState,
  onTest,
}: {
  squadNumber: 1 | 2;
  value: string;
  onChange: (v: string) => void;
  testState:
    | { status: "idle" }
    | { status: "testing" }
    | { status: "ok" }
    | { status: "error"; reason: string };
  onTest: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        Squad {squadNumber} voice channel ID
      </label>
      <div className="flex items-center gap-2">
        <input
          name={`squad${squadNumber}VoiceChannelId`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 123456789012345678"
          className="flex-1 border rounded px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={testState.status === "testing" || !value.trim()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {testState.status === "testing" ? "Sending..." : "Test DM"}
        </button>
      </div>
      {testState.status === "ok" && (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Test DM sent — check your Discord direct messages from the bot.
        </p>
      )}
      {testState.status === "error" && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-300">
          {testState.reason}
        </p>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="size-3.5"
    >
      <path
        d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
