"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { FieldHelp } from "@/components/field-help";
import { DEFAULT_DUEL_LOCATIONS } from "@/lib/duels";

const LOCATION_OTHER = "__other__";

type OpponentOption = {
  id: string;
  displayName: string;
  // For the badge under the opponent select.
  powerTier: string | null;
  duelRating: number;
};

// Used at /duels/new. The opponent dropdown is pre-filtered by the server
// to same-server, discoverable, non-self players — we just trust the list.
// If `preselectedOpponentId` is set (deep link from /players), the dropdown
// defaults to that player but is still editable.
export function ProposeDuelForm({
  opponents,
  preselectedOpponentId,
}: {
  opponents: OpponentOption[];
  preselectedOpponentId?: string;
}) {
  const router = useRouter();
  const initialOpponent =
    preselectedOpponentId && opponents.some((o) => o.id === preselectedOpponentId)
      ? preselectedOpponentId
      : opponents[0]?.id ?? "";

  const [opposingUserId, setOpposingUserId] = useState(initialOpponent);
  const [locationChoice, setLocationChoice] = useState<string>(
    DEFAULT_DUEL_LOCATIONS[0]
  );
  const [customLocation, setCustomLocation] = useState("");
  const [winCondition, setWinCondition] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOpponent = opponents.find((o) => o.id === opposingUserId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const proposedGameTime = String(form.get("proposedGameTime") ?? "");
    const location =
      locationChoice === LOCATION_OTHER ? customLocation.trim() : locationChoice;

    if (!opposingUserId) {
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

    const res = await fetch("/api/duels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opposingUserId,
        proposedGameTime,
        location,
        winCondition: winCondition.trim(),
        message: message.trim() || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to send challenge.");
      setSubmitting(false);
      return;
    }

    const body = (await res.json().catch(() => ({}))) as {
      notify?: { failedPlayerNames?: string[] };
    };
    const failed = body.notify?.failedPlayerNames ?? [];
    if (failed.length > 0) {
      window.alert(
        `Challenge sent, but Discord DM didn't reach: ${failed.join(", ")}.\n\n` +
          "They may have DMs disabled from server members in Discord."
      );
    }

    router.push("/duels");
    router.refresh();
  }

  if (opponents.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        No discoverable players on your server yet. Once other players opt in
        on their My Account page, they&apos;ll show up here.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1">Opponent *</label>
        <select
          value={opposingUserId}
          onChange={(e) => setOpposingUserId(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.displayName}
              {o.powerTier ? ` · ${o.powerTier}` : ""} · {o.duelRating}
            </option>
          ))}
        </select>
        {selectedOpponent && (
          <p className="mt-1 text-xs text-gray-500">
            {selectedOpponent.displayName} ·{" "}
            {selectedOpponent.powerTier
              ? `Tier ${selectedOpponent.powerTier}`
              : "No tier set"}{" "}
            · {selectedOpponent.duelRating} rating
          </p>
        )}
        <FieldHelp>
          Filtered to discoverable players on your same server.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Game time *</label>
        <DatetimeLocalField name="proposedGameTime" required />
        <FieldHelp>
          When the duel will happen. Both sides see this in their local time.
        </FieldHelp>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Location *</label>
        <select
          value={locationChoice}
          onChange={(e) => setLocationChoice(e.target.value)}
          className="w-full border rounded px-3 py-2"
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
            className="mt-2 w-full border rounded px-3 py-2"
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
          placeholder="e.g. First to 5 kills, or last player standing."
          className="w-full border rounded px-3 py-2"
        />
        <FieldHelp>
          Agree the rules up front. Both sides see this and it&apos;s tied to
          the declared result.
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
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send challenge"}
      </button>
    </form>
  );
}
