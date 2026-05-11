"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Thumbs up / down feedback for the opponent after a duel result is
// declared. One submission per side per duel; locked after submit so
// retaliation edit-cycles aren't possible.
export function DuelFeedbackForm({
  duelId,
  existing,
}: {
  duelId: string;
  existing: "up" | "down" | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(rating: "up" | "down") {
    if (existing) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/duels/${duelId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      setPending(false);
      return;
    }
    router.refresh();
  }

  if (existing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="font-semibold text-gray-900">Your feedback</p>
        <p className="mt-1 text-gray-600">
          You rated your opponent{" "}
          {existing === "up" ? "👍 positive" : "👎 negative"}. Feedback is
          locked once submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold text-gray-900">
        Rate this opponent
      </p>
      <p className="mt-1 text-xs text-gray-500">
        How was the experience? Reputation aggregates show as percentages on
        their player card. One rating per duel — locks in once submitted.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => submit("up")}
          disabled={pending}
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          👍 Good sport
        </button>
        <button
          type="button"
          onClick={() => submit("down")}
          disabled={pending}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          👎 Not great
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
