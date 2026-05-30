"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FieldHelp } from "@/components/field-help";
import { BOT_INSTALL_URL } from "@/lib/bot-install-url";

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
  const t = useTranslations("guildSettingsPage");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
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
      setError(data?.error ?? te("failed"));
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
      setTestResult({ ok: false, reason: data?.error ?? t("testFailed") });
    }
    setTesting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t("discordIntegrationTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("discordIntegrationDesc")}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>{t("botInstallStep")}</strong> {t("botInstallDesc")}
        </p>
        <a
          href={BOT_INSTALL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {t("botInstallButton")}
          <ExternalLinkIcon />
        </a>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          <strong>{t("channelIdStep")}</strong> {t("discordChannelId")}
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
            {testing ? t("testing") : t("testIntegration")}
          </button>
        </div>
        <FieldHelp>{t("discordChannelIdHelp")}</FieldHelp>
        {testResult?.ok && (
          <div className="mt-1 space-y-1 text-sm">
            <p className="text-emerald-700 dark:text-emerald-300">
              {t("testSuccessText")}
            </p>
            {testResult.link?.ok && (
              <p className="text-emerald-700 dark:text-emerald-300">
                {testResult.link.changed
                  ? t("serverLinkRefreshed")
                  : t("serverLinkConfirmed")}{" "}
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {t("discordServerIdLabel", { id: testResult.link.discordGuildId })}
                </span>
              </p>
            )}
            {testResult.link && !testResult.link.ok && (
              <p className="text-amber-700 dark:text-amber-300">
                {t("serverLinkFailed", { reason: testResult.link.reason })}
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
            {t("voiceChannelsTitle")}{" "}
            <span className="font-normal text-gray-500 dark:text-gray-400">{t("voiceChannelsMatchOnly")}</span>
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("voiceChannelsDesc")}
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
          {submitting ? tc("saving") : t("saveDiscordSettings")}
        </button>
        {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-300">{tc("saved")}</span>}
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
  const t = useTranslations("guildSettingsPage");
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {t("squadVoiceChannelLabel", { number: squadNumber })}
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
          {testState.status === "testing" ? t("sending") : t("testDm")}
        </button>
      </div>
      {testState.status === "ok" && (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          {t("testDmSent")}
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
