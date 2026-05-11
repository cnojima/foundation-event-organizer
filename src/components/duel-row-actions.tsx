"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "accept" | "decline" | "withdraw" | "cancel";

const LABELS: Record<Action, string> = {
  accept: "Accept",
  decline: "Decline",
  withdraw: "Withdraw",
  cancel: "Cancel duel",
};

const CONFIRMS: Partial<Record<Action, string>> = {
  decline: "Decline this duel challenge?",
  withdraw: "Withdraw this challenge?",
  cancel: "Cancel this accepted duel? Both players will be notified.",
};

const STYLES: Record<Action, string> = {
  accept: "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50",
  decline:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  withdraw:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  cancel:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50",
};

// Posts to /api/duels/[id]/<action>. Duel notifications go out as direct
// messages; surfaces a soft warning when the response's
// notify.failedPlayerNames is non-empty (usually means the recipient has
// Discord DMs disabled).
export function DuelAction({
  duelId,
  action,
}: {
  duelId: string;
  action: Action;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const confirm = CONFIRMS[action];
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/duels/${duelId}/${action}`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      setPending(false);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      notify?: { failedPlayerNames?: string[] };
    };
    const failed = body.notify?.failedPlayerNames ?? [];
    if (failed.length > 0) {
      window.alert(
        `Discord DM didn't reach: ${failed.join(", ")}.\n\n` +
          "They may have DMs disabled from server members in Discord."
      );
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${STYLES[action]}`}
      >
        {pending ? "…" : LABELS[action]}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
