"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinGuildButton({ guildId }: { guildId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/guilds/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? "Failed to join");
    setSubmitting(false);
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Joining..." : "Join"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
