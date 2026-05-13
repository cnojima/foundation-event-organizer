"use client";

import { useState } from "react";
import { DuelEditForm } from "@/components/duel-edit-form";

// Small client wrapper that toggles between "Edit" button and the inline
// DuelEditForm. Kept separate so the parent /duels/[id] page can stay a
// server component — only this wrapper carries client state.
export function DuelEditToggle({
  duelId,
  defaultGameTimeUtc,
  defaultLocation,
  defaultWinCondition,
  defaultMessage,
}: {
  duelId: string;
  defaultGameTimeUtc: string;
  defaultLocation: string;
  defaultWinCondition: string;
  defaultMessage: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Edit proposal
      </button>
    );
  }

  return (
    <DuelEditForm
      duelId={duelId}
      defaultGameTimeUtc={defaultGameTimeUtc}
      defaultLocation={defaultLocation}
      defaultWinCondition={defaultWinCondition}
      defaultMessage={defaultMessage}
      onClose={() => setOpen(false)}
    />
  );
}
