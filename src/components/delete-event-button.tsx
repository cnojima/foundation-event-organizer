"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteEventButton({
  eventId,
  eventName,
  signupCount,
}: {
  eventId: string;
  eventName: string;
  signupCount: number;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const message =
      signupCount > 0
        ? `Delete "${eventName}" and remove ${signupCount} signup${signupCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${eventName}"? This cannot be undone.`;
    if (!confirm(message)) return;

    setDeleting(true);
    const res = await fetch(`/api/admin/events/${eventId}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Failed to delete event.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
        <path
          d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {deleting ? "Deleting…" : "Delete Event"}
    </button>
  );
}
