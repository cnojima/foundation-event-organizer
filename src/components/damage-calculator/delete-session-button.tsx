"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Delete this session and all its readings? This can't be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/damage-calculator/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
    >
      Delete
    </button>
  );
}
