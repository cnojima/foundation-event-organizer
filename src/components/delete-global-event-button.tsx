"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteGlobalEventButton({
  globalEventId,
  eventName,
}: {
  globalEventId: string;
  eventName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${eventName}"? This will soft-delete the global event and all guild copies. Guild attendance records are preserved.`
      )
    )
      return;

    setDeleting(true);
    const res = await fetch(`/api/super-admin/global-events/${globalEventId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setDeleting(false);
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Failed to delete global event.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
