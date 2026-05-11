"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Outcome = "won" | "lost" | "draw" | "no_contest";

const OPTIONS: { value: Outcome; label: string; help: string }[] = [
  { value: "won", label: "We won", help: "Our guild won the scrim." },
  { value: "lost", label: "We lost", help: "The opposing guild won." },
  { value: "draw", label: "Draw", help: "Neither side took the win." },
  {
    value: "no_contest",
    label: "No contest",
    help: "Match didn't complete (forfeit, disconnect, etc.).",
  },
];

// Used on /admin/event/[id] for scrim events when no result has been declared
// yet. Posts viewer-relative outcome + optional notes; server flips "won"/"lost"
// to the absolute proposing_won/opposing_won enum based on the viewer's side.
export function ScrimResultForm({ scrimId }: { scrimId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("won");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!window.confirm("Declare this scrim result? This is visible to both guilds.")) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/scrimmages/${scrimId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, notes: notes.trim() || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4"
    >
      <p className="text-sm font-semibold text-gray-900">Declare scrim result</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((opt) => {
          const active = outcome === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOutcome(opt.value)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">
                {opt.label}
              </div>
              <div className="text-xs text-gray-500">{opt.help}</div>
            </button>
          );
        })}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save result"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
