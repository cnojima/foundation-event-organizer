"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type QueueApplication = {
  id: string;
  playerName: string;
  sourceServer: string;
  power: number;
  contact: string | null;
  createdAt: string;
};

// Single review-queue row. Client component because it owns the
// accept/deny/waitlist/remove actions — modeled on audit-row.tsx.
export function MigrationQueueRow({
  application,
  showRemove,
}: {
  application: QueueApplication;
  showRemove: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function act(action: "accept" | "deny" | "waitlist" | "remove") {
    setError(null);
    setSubmitting(action);
    const res = await fetch(
      `/api/admin/migration-tracker/applications/${application.id}/${action}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(null);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800">
        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
          {application.playerName}
          {application.contact && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({application.contact})
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{application.sourceServer}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
          {application.power.toLocaleString()}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          {new Date(application.createdAt).toLocaleDateString()}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => act("accept")}
              disabled={!!submitting}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => act("waitlist")}
              disabled={!!submitting}
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
            >
              Waitlist
            </button>
            <button
              type="button"
              onClick={() => act("deny")}
              disabled={!!submitting}
              className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              Deny
            </button>
            {showRemove &&
              (!confirmRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  disabled={!!submitting}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Remove
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => act("remove")}
                    disabled={!!submitting}
                    className="rounded-md border border-gray-500 bg-gray-700 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </>
              ))}
          </div>
        </td>
      </tr>
      {error && (
        <tr className="bg-red-50 dark:bg-red-950/20">
          <td colSpan={5} className="px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
