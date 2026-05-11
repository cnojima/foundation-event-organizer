"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "accept" | "decline" | "withdraw" | "cancel";

const LABELS: Record<Action, string> = {
  accept: "Accept",
  decline: "Decline",
  withdraw: "Withdraw",
  cancel: "Cancel scrim",
};

const CONFIRMS: Partial<Record<Action, string>> = {
  decline: "Decline this scrim proposal?",
  withdraw: "Withdraw this proposal?",
  cancel:
    "Cancel this accepted scrim? Both guilds' mirrored events will be soft-deleted.",
};

const STYLES: Record<Action, string> = {
  accept:
    "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50",
  decline:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  withdraw:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
  cancel:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50",
};

// Posts to /api/scrimmages/[id]/<action> and refreshes the page on success.
// Used in the admin scrim dashboard cards.
export function ScrimAction({
  scrimId,
  action,
}: {
  scrimId: string;
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
    const res = await fetch(`/api/scrimmages/${scrimId}/${action}`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed");
      setPending(false);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      notify?: { failedGuildNames?: string[] };
    };
    const failed = body.notify?.failedGuildNames ?? [];
    if (failed.length > 0) {
      window.alert(
        `Discord notification didn't reach: ${failed.join(", ")}.\n\n` +
          "Check that the bot is in their Discord server and the channel ID in Guild Settings is correct."
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
