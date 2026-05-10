"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

export function GuildSettingsForm({
  guildId,
  defaultName,
  defaultDescription,
  defaultIsPublic,
  defaultDiscordChannelId,
  defaultServerNumber,
  defaultTag,
}: {
  guildId: string;
  defaultName: string;
  defaultDescription: string;
  defaultIsPublic: boolean;
  defaultDiscordChannelId: string;
  defaultServerNumber: string;
  defaultTag: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState(defaultDiscordChannelId);

  // Test-integration state — separate from the save state so the two buttons
  // can be used independently.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true } | { ok: false; reason: string } | null
  >(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const serverNumberRaw = String(form.get("serverNumber") ?? "").trim();
    const tagRaw = String(form.get("tag") ?? "").trim();
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || null,
        isPublic: form.get("isPublic") === "on",
        discordChannelId: channelId.trim() || null,
        serverNumber: serverNumberRaw === "" ? null : Number(serverNumberRaw),
        tag: tagRaw === "" ? null : tagRaw,
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>Display name shown in the sidebar and discovery list.</FieldHelp>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={defaultDescription}
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>Optional. Shown on the public guild page to help recruiting.</FieldHelp>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={defaultIsPublic} />
          Listed in public discovery
        </label>
        <FieldHelp>
          When on, signed-in users can find this guild on /guilds and join with
          one click. When off, you can only invite members via invite link.
        </FieldHelp>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
        <div>
          <label className="block text-sm font-medium mb-1">Server #</label>
          <input
            name="serverNumber"
            type="number"
            min={1001}
            max={9999}
            step={1}
            defaultValue={defaultServerNumber}
            placeholder="e.g. 1234"
            className="w-full border rounded px-3 py-2 font-mono"
          />
          <FieldHelp>
            Game-server number (1001-9999). Optional. Shown for ops reference.
          </FieldHelp>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Guild Tag</label>
          <input
            name="tag"
            type="text"
            minLength={2}
            maxLength={4}
            defaultValue={defaultTag}
            placeholder="e.g. SHFT"
            className="w-full border rounded px-3 py-2 font-mono uppercase"
          />
          <FieldHelp>
            2-4 characters. When set, prepended to every member&apos;s
            displayed name as <code>[TAG] name</code>.
          </FieldHelp>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-sm font-medium mb-1">
          Discord channel ID
        </label>
        <div className="flex items-center gap-2">
          <input
            name="discordChannelId"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 123456789012345678"
            className="flex-1 border rounded px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !channelId.trim()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test integration"}
          </button>
        </div>
        <FieldHelp>
          Optional. The bot will post @everyone reminders here 1 day, 1 hour,
          and 20 minutes before each event. Leave blank to disable. Add the
          bot to your server first, then right-click the channel in Discord →
          Copy Channel ID (Developer Mode required). Test sends a one-off
          message to the channel — no @everyone ping.
        </FieldHelp>
        {testResult?.ok && (
          <p className="mt-1 text-sm text-emerald-700">
            ✅ Test message sent. Check the channel.
          </p>
        )}
        {testResult && !testResult.ok && (
          <p className="mt-1 text-sm text-red-600">{testResult.reason}</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    </form>
  );
}
