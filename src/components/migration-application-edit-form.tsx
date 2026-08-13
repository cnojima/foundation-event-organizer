"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type EditableApplication = {
  playerName: string;
  sourceServer: string;
  power: number;
  contact: string | null;
  tier: string;
  status: string;
};

export function MigrationApplicationEditForm({
  token,
  application,
}: {
  token: string;
  application: EditableApplication;
}) {
  const router = useRouter();
  const t = useTranslations("migrationTrackerEdit");
  const tShared = useTranslations("migrationTracker");
  const tc = useTranslations("common");

  const tierLabel: Record<string, string> = {
    ultra_high: tShared("tierUltraHigh"),
    high: tShared("tierHigh"),
    mid: tShared("tierMid"),
    low: tShared("tierLow"),
  };

  const [sourceServer, setSourceServer] = useState(application.sourceServer);
  const [power, setPower] = useState(String(application.power));
  const [contact, setContact] = useState(application.contact ?? "");
  const [tier, setTier] = useState(application.tier);
  const [status, setStatus] = useState(application.status);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const powerNumber = Number(power);
    if (!sourceServer.trim()) {
      setError(t("errorSourceServerRequired"));
      return;
    }
    if (!Number.isFinite(powerNumber) || powerNumber < 0 || !Number.isInteger(powerNumber)) {
      setError(t("errorPower"));
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/migration-tracker/applications/by-token/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceServer: sourceServer.trim(),
        power: powerNumber,
        contact: contact.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data?.error ?? t("errorGeneric"));
      return;
    }
    setTier(data.application.tier);
    setStatus(data.application.status);
    setSaved(true);
  }

  async function handleWithdraw() {
    setError(null);
    setWithdrawing(true);
    const res = await fetch(`/api/migration-tracker/applications/by-token/${token}/withdraw`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? t("errorGeneric"));
      setWithdrawing(false);
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSave}
      className="space-y-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {status === "waitlisted"
          ? t("introWaitlisted", { playerName: application.playerName, tier: tierLabel[tier] ?? tier })
          : t("introAwaiting", { playerName: application.playerName, tier: tierLabel[tier] ?? tier })}
      </p>

      <div>
        <label htmlFor="mte-source-server" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("sourceServerLabel")}
        </label>
        <input
          id="mte-source-server"
          type="text"
          required
          maxLength={60}
          value={sourceServer}
          onChange={(e) => setSourceServer(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label htmlFor="mte-power" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("powerLabel")}
        </label>
        <input
          id="mte-power"
          type="number"
          inputMode="numeric"
          required
          min={0}
          step={1}
          value={power}
          onChange={(e) => setPower(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{t("powerHelp")}</p>
      </div>
      <div>
        <label htmlFor="mte-contact" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("contactLabel")} <span className="text-gray-400">({tc("optional")})</span>
        </label>
        <input
          id="mte-contact"
          type="text"
          maxLength={120}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      {error && (
        <p
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {tc("saved")}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? tc("saving") : t("saveButton")}
        </button>

        {!confirmWithdraw ? (
          <button
            type="button"
            onClick={() => setConfirmWithdraw(true)}
            className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
          >
            {t("withdrawButton")}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-400">{t("withdrawConfirmPrompt")}</span>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              {withdrawing ? t("withdrawing") : t("withdrawConfirmYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmWithdraw(false)}
              className="text-gray-500 hover:underline dark:text-gray-400"
            >
              {tc("cancel")}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
