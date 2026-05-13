"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Outcome = "won" | "lost" | "draw" | "no_contest";

const OPTIONS: { value: Outcome; label: string; help: string }[] = [
  { value: "won", label: "I won", help: "You won the duel." },
  { value: "lost", label: "I lost", help: "Your opponent won." },
  { value: "draw", label: "Draw", help: "Neither side took the win." },
  {
    value: "no_contest",
    label: "No contest",
    help: "Duel didn't complete (forfeit, disconnect, etc.). No rating change.",
  },
];

// Result declaration for /duels/[id]. Single-declaration model: the first
// player to submit locks in the result. The other player can see the chip
// but can't change it (super-admin escalation if disputed).
export function DuelResultForm({ duelId }: { duelId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>("won");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        "Declare this duel result? This locks in ratings for both players and is visible to your opponent."
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/duels/${duelId}/result`, {
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
      className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900/60 dark:bg-violet-950/20"
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Declare duel result</p>
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
                  ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500 dark:bg-violet-950/40"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {opt.label}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{opt.help}</div>
            </button>
          );
        })}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save result"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        First-writer-wins — once declared, the result locks in and updates
        both players&apos; ELO ratings.
      </p>
    </form>
  );
}
