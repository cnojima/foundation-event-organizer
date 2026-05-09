"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InGameNameDialog({ suggested }: { suggested?: string }) {
  const router = useRouter();
  const [name, setName] = useState(suggested ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inGameName: name.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save name.");
      setSubmitting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ign-title"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 id="ign-title" className="text-lg font-bold text-gray-900">
          Set your in-game name
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          This is how you&apos;ll appear on event rosters and signups. You can
          change it later in your profile.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NovaSpectre"
            maxLength={32}
            required
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
