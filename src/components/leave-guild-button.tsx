"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LeaveGuildButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (
      !confirm(
        "Leave this guild? Your past signups will be hidden from your view (kept for guild attendance reports)."
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch("/api/guilds/leave", { method: "POST" });
    if (res.ok) {
      router.push("/guilds");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? "Failed");
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        Leave guild
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
