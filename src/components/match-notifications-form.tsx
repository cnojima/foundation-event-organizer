"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

// Per-user opt-outs for match-event DMs (currently just voice channel
// invites, but the section is set up to grow). Mirrors the slash-command
// /settings registry on the bot side — keep this section in sync when
// adding new toggles. Strings are English-only for now; i18n keys are a
// follow-up.
export function MatchNotificationsForm({
  defaultVoiceDmEnabled,
  discordLinked,
}: {
  defaultVoiceDmEnabled: boolean;
  // True when the user has signed in with Discord at least once. When
  // false, the voice DM toggle is shown but greyed out with a hint to
  // link Discord — without a linked account, the bot can't DM anyway.
  discordLinked: boolean;
}) {
  const router = useRouter();
  const [voiceDmEnabled, setVoiceDmEnabled] = useState(defaultVoiceDmEnabled);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceDmEnabled }),
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

  const dirty = voiceDmEnabled !== defaultVoiceDmEnabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={voiceDmEnabled}
            onChange={(e) => setVoiceDmEnabled(e.target.checked)}
            disabled={!discordLinked}
            className="mt-0.5"
          />
          <span className={discordLinked ? "" : "text-gray-400 dark:text-gray-500"}>
            Receive voice channel invites for matches
          </span>
        </label>
        <FieldHelp>
          {discordLinked
            ? "When ON, the bot DMs you ~10 minutes before each match you're assigned to with a clickable join link for your squad's voice channel. Independent of the broader text-channel reminder."
            : "Sign in with Discord (or enter your Discord User ID above) to enable this — without a linked Discord account, the bot can't DM you."}
        </FieldHelp>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !dirty}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-600 dark:text-emerald-300">Saved.</span>
        )}
      </div>
    </form>
  );
}
