"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { FieldHelp } from "@/components/field-help";
import { DEFAULT_DUEL_LOCATIONS } from "@/lib/duels";

const LOCATION_OTHER = "__other__";

// Inline edit form for pending duels. Either side can use it — the
// PATCH endpoint stamps `lastEditedByUserId` so the accept endpoint
// requires the OTHER side to confirm the new terms.
//
// Toggles between display + form via parent control or its own state.
// Pre-fills with current values; on save, calls PATCH /api/duels/[id]
// then refreshes the parent page.
export function DuelEditForm({
  duelId,
  defaultGameTimeUtc,
  defaultLocation,
  defaultWinCondition,
  defaultMessage,
  onClose,
}: {
  duelId: string;
  defaultGameTimeUtc: string;
  defaultLocation: string;
  defaultWinCondition: string;
  defaultMessage: string | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  // Match the proposed location to a canonical map; everything else is
  // "Other…" with the original string in the custom-text field.
  const isCanonical = (DEFAULT_DUEL_LOCATIONS as readonly string[]).includes(
    defaultLocation
  );
  const [locationChoice, setLocationChoice] = useState<string>(
    isCanonical ? defaultLocation : LOCATION_OTHER
  );
  const [customLocation, setCustomLocation] = useState(
    isCanonical ? "" : defaultLocation
  );
  const [winCondition, setWinCondition] = useState(defaultWinCondition);
  const [message, setMessage] = useState(defaultMessage ?? "");
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

    const res = await fetch(`/api/duels/${duelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposedGameTime,
        location,
        winCondition: winCondition.trim(),
        message: message.trim() || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to save changes.");
      setSubmitting(false);
      return;
    }

    const body = (await res.json().catch(() => ({}))) as {
      notify?: { failedPlayerNames?: string[] };
    };
    const failed = body.notify?.failedPlayerNames ?? [];
    if (failed.length > 0) {
      window.alert(
        `Changes saved, but Discord DM didn't reach: ${failed.join(", ")}.\n\n` +
          "They may have DMs disabled from server members in Discord."
      );
    }

    router.refresh();
    onClose?.();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900/60 dark:bg-violet-950/20"
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit duel proposal</p>

      <div>
        <label className="block text-sm font-medium mb-1">Game time *</label>
        <DatetimeLocalField
          name="proposedGameTime"
          required
          defaultUtcIso={defaultGameTimeUtc}
        />
        <FieldHelp>
          Saving stamps you as the latest editor, so the other player has to
          accept the new terms.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location *</label>
        <select
          value={locationChoice}
          onChange={(e) => setLocationChoice(e.target.value)}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        >
          {DEFAULT_DUEL_LOCATIONS.map((loc) => (
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
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Condition of Win *
        </label>
        <textarea
          value={winCondition}
          onChange={(e) => setWinCondition(e.target.value)}
          rows={2}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
