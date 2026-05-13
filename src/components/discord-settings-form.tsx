"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

// Discord OAuth install URL for the Event Organizer bot. The client_id is the
// app's Discord application ID — fixed per deployment, embedded here so the
// CTA works without a per-guild env lookup. permissions=2147616768 covers
// Send Messages + Mention Everyone (required for @everyone reminders).
const BOT_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1502013027858387054&scope=bot+applications.commands&permissions=2147616768";

// Standalone card for Discord integration: bot-invite CTA, channel ID,
// test-integration button. Saves the channel ID independently of the main
// guild settings form via PATCH /api/guilds/[id] (partial update).
export function DiscordSettingsForm({
  guildId,
  defaultDiscordChannelId,
}: {
  guildId: string;
  defaultDiscordChannelId: string;
}) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(defaultDiscordChannelId);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true } | { ok: false; reason: string } | null
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
      setTestResult({ ok: true });
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
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
            Test message sent. Check the channel.
          </p>
        )}
        {testResult && !testResult.ok && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-300">{testResult.reason}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save channel"}
        </button>
        {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-300">Saved.</span>}
      </div>
    </form>
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
