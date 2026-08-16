"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PowerInput } from "@/components/power-input";

type SubmittedApplication = {
  playerName: string;
  tier: string;
  status: string;
};

export function MigrationApplicationForm({ serverNumber }: { serverNumber: number }) {
  const t = useTranslations("migrationTrackerSubmit");
  const tShared = useTranslations("migrationTracker");
  const tc = useTranslations("common");

  const tierLabel: Record<string, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };

  const [playerName, setPlayerName] = useState("");
  const [sourceServer, setSourceServer] = useState("");
  const [power, setPower] = useState("");
  const [desiredGuild, setDesiredGuild] = useState("");
  const [gameUid, setGameUid] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    application: SubmittedApplication;
    editToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const powerNumber = Number(power);
    if (!playerName.trim() || !sourceServer.trim()) {
      setError(t("errorRequired"));
      return;
    }
    if (!gameUid.trim()) {
      setError(t("errorGameUidRequired"));
      return;
    }
    if (!Number.isFinite(powerNumber) || powerNumber < 0 || !Number.isInteger(powerNumber)) {
      setError(t("errorPower"));
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/migration-tracker/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverNumber,
        playerName: playerName.trim(),
        sourceServer: sourceServer.trim(),
        power: powerNumber,
        desiredGuild: desiredGuild.trim() || undefined,
        gameUid: gameUid.trim(),
        contact: contact.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? t("errorGeneric"));
      setSubmitting(false);
      return;
    }
    setResult(data);
    setSubmitting(false);
  }

  const editUrl = result ? `/migration-tracker/edit/${result.editToken}` : null;

  async function copyEditLink() {
    if (!editUrl) return;
    const fullUrl = `${window.location.origin}${editUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the link is still shown and selectable.
    }
  }

  if (result) {
    const tierText = tierLabel[result.application.tier] ?? result.application.tier;
    return (
      <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            {t("successHeading")}
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            {result.application.status === "waitlisted"
              ? t("successBodyWaitlisted", { playerName: result.application.playerName, tier: tierText })
              : t("successBodyReview", { playerName: result.application.playerName, tier: tierText })}
          </p>
        </div>

        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">{t("saveLinkHeading")}</p>
          <p className="mt-1">{t("saveLinkBody")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white/70 px-2 py-1 text-xs text-gray-800 dark:bg-black/30 dark:text-gray-200">
              {editUrl}
            </code>
            <button
              type="button"
              onClick={copyEditLink}
              className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {copied ? t("copied") : t("copyLink")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label htmlFor="mt-player-name" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("playerNameLabel")}
        </label>
        <input
          id="mt-player-name"
          type="text"
          required
          maxLength={60}
          placeholder={t("playerNamePlaceholder")}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label htmlFor="mt-game-uid" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("gameUidLabel")}
        </label>
        <input
          id="mt-game-uid"
          type="text"
          required
          maxLength={60}
          placeholder={t("gameUidPlaceholder")}
          value={gameUid}
          onChange={(e) => setGameUid(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] font-medium text-violet-600 hover:underline dark:text-violet-400">
            {t("gameUidHintToggle")}
          </summary>
          <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">{t("gameUidHintBody")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- static help screenshot inside a collapsed <details>, not worth next/image's overhead */}
          <img
            src="/migration-tracker/uid-hint.jpg"
            alt={t("gameUidHintToggle")}
            width={1218}
            height={1844}
            className="mt-2 max-w-[280px] rounded border border-gray-200 dark:border-gray-700"
          />
        </details>
      </div>
      <div>
        <label htmlFor="mt-source-server" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("sourceServerLabel")}
        </label>
        <input
          id="mt-source-server"
          type="text"
          required
          maxLength={60}
          placeholder={t("sourceServerPlaceholder")}
          value={sourceServer}
          onChange={(e) => setSourceServer(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label htmlFor="mt-power" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("powerLabel")}
        </label>
        <PowerInput
          id="mt-power"
          required
          placeholder={t("powerPlaceholder")}
          value={power}
          onChange={setPower}
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{t("powerHelp")}</p>
      </div>
      <div>
        <label htmlFor="mt-desired-guild" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("desiredGuildLabel")} <span className="text-gray-400">({tc("optional")})</span>
        </label>
        <input
          id="mt-desired-guild"
          type="text"
          maxLength={60}
          placeholder={t("desiredGuildPlaceholder")}
          value={desiredGuild}
          onChange={(e) => setDesiredGuild(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <div>
        <label htmlFor="mt-contact" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("contactLabel")} <span className="text-gray-400">({tc("optional")})</span>
        </label>
        <input
          id="mt-contact"
          type="text"
          maxLength={120}
          placeholder={t("contactPlaceholder")}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{t("contactHelp")}</p>
      </div>

      {error && (
        <p
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? tc("submitting") : t("submitButton")}
      </button>
    </form>
  );
}
