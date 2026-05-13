"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { FieldHelp } from "@/components/field-help";
import { DEFAULT_SCRIM_LOCATIONS } from "@/lib/scrims";

type OpponentOption = {
  id: string;
  name: string;
  tag: string | null;
};

const LOCATION_OTHER = "__other__";

// Used at /admin/scrimmages/new. Opponents are limited to same-server guilds
// (filtered server-side before render). Location is a dropdown of the four
// canonical maps + "Other" with a free-text fallback.
export function ProposeScrimForm({ opponents }: { opponents: OpponentOption[] }) {
  const router = useRouter();
  const [opposingGuildId, setOpposingGuildId] = useState<string>(
    opponents[0]?.id ?? ""
  );
  const [locationChoice, setLocationChoice] = useState<string>(
    DEFAULT_SCRIM_LOCATIONS[0]
  );
  const [customLocation, setCustomLocation] = useState("");
  const [winCondition, setWinCondition] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const proposedGameTime = String(form.get("proposedGameTime") ?? "");
    const location =
      locationChoice === LOCATION_OTHER ? customLocation.trim() : locationChoice;

    if (!opposingGuildId) {
      setError("Pick an opponent.");
      setSubmitting(false);
      return;
    }
    if (!proposedGameTime) {
      setError("Game time is required.");
      setSubmitting(false);
      return;
    }
    if (!location) {
      setError("Location is required.");
      setSubmitting(false);
      return;
    }
    if (!winCondition.trim()) {
      setError("Condition of Win is required.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/scrimmages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opposingGuildId,
        proposedGameTime,
        location,
        winCondition: winCondition.trim(),
        message: message.trim() || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to send proposal.");
      setSubmitting(false);
      return;
    }

    const body = (await res.json().catch(() => ({}))) as {
      notify?: { failedGuildNames?: string[] };
    };
    const failed = body.notify?.failedGuildNames ?? [];
    if (failed.length > 0) {
      window.alert(
        `Proposal sent, but Discord notification didn't reach: ${failed.join(", ")}.\n\n` +
          "Check that the bot is in their Discord server and the channel ID in Guild Settings is correct."
      );
    }

    router.push("/admin/scrimmages");
    router.refresh();
  }

  if (opponents.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        No other guilds share your server number. Ask the other guild&apos;s
        admin to set their Server # in Guild Settings (or set yours if missing).
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div>
        <label className="block text-sm font-medium mb-1">Opponent *</label>
        <select
          value={opposingGuildId}
          onChange={(e) => setOpposingGuildId(e.target.value)}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        >
          {opponents.map((g) => (
            <option key={g.id} value={g.id}>
              {g.tag ? `[${g.tag}] ${g.name}` : g.name}
            </option>
          ))}
        </select>
        <FieldHelp>
          Only guilds on your same Server # are eligible. They&apos;ll see the
          proposal in their own scrim dashboard.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Game time *</label>
        <DatetimeLocalField name="proposedGameTime" required />
        <FieldHelp>
          Proposed kick-off. Both guilds&apos; admins see this before accepting.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location *</label>
        <select
          value={locationChoice}
          onChange={(e) => setLocationChoice(e.target.value)}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        >
          {DEFAULT_SCRIM_LOCATIONS.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
          <option value={LOCATION_OTHER}>Other…</option>
        </select>
        {locationChoice === LOCATION_OTHER && (
          <input
            type="text"
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            placeholder="Custom location"
            className="mt-2 w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        )}
        <FieldHelp>Where the scrim will take place.</FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Condition of Win *
        </label>
        <textarea
          value={winCondition}
          onChange={(e) => setWinCondition(e.target.value)}
          rows={2}
          placeholder="e.g. First team to 3 capture points, or hold the central fortress for 5 minutes."
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <FieldHelp>
          Agree the rules up front. Visible to both sides; declared with the result.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Anything else to add — house rules, format, etc."
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send proposal"}
      </button>
    </form>
  );
}
