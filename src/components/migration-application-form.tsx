"use client";

import { useState } from "react";

type SubmittedApplication = {
  playerName: string;
  tier: string;
  status: string;
};

const TIER_FLAVOR_LABEL: Record<string, string> = {
  ultra_high: "Revivalist",
  high: "Contributor",
  mid: "Pioneer",
  low: "Follower",
};

export function MigrationApplicationForm() {
  const [playerName, setPlayerName] = useState("");
  const [sourceServer, setSourceServer] = useState("");
  const [power, setPower] = useState("");
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
      setError("Player name and source server are required.");
      return;
    }
    if (!Number.isFinite(powerNumber) || powerNumber < 0 || !Number.isInteger(powerNumber)) {
      setError("Power must be a whole number.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/migration-tracker/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName: playerName.trim(),
        sourceServer: sourceServer.trim(),
        power: powerNumber,
        contact: contact.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
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
    return (
      <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            Application submitted.
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            {result.application.playerName} — classified as{" "}
            <strong>{TIER_FLAVOR_LABEL[result.application.tier] ?? result.application.tier}</strong>
            {result.application.status === "waitlisted"
              ? " and placed on the waitlist (that tier's cap is currently reserved)."
              : ", awaiting officer review."}
          </p>
        </div>

        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Save this link — you won&apos;t see it again.</p>
          <p className="mt-1">
            Use it to edit your application or withdraw later. There&apos;s no account, so this
            link is the only way back in.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white/70 px-2 py-1 text-xs text-gray-800 dark:bg-black/30 dark:text-gray-200">
              {editUrl}
            </code>
            <button
              type="button"
              onClick={copyEditLink}
              className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {copied ? "Copied!" : "Copy link"}
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
          Player name *
        </label>
        <input
          id="mt-player-name"
          type="text"
          required
          maxLength={60}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label htmlFor="mt-source-server" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Source server *
        </label>
        <input
          id="mt-source-server"
          type="text"
          required
          maxLength={60}
          placeholder="e.g. #1042"
          value={sourceServer}
          onChange={(e) => setSourceServer(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div>
        <label htmlFor="mt-power" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Power *
        </label>
        <input
          id="mt-power"
          type="number"
          inputMode="numeric"
          required
          min={0}
          step={1}
          placeholder="e.g. 95000000"
          value={power}
          onChange={(e) => setPower(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
          Your tier is determined automatically from this number.
        </p>
      </div>
      <div>
        <label htmlFor="mt-contact" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          Contact <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="mt-contact"
          type="text"
          maxLength={120}
          placeholder="Discord handle"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
          Helps officers reach you with questions.
        </p>
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
        {submitting ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
