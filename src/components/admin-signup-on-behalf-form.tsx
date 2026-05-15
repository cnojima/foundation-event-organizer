"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

export type EligibleMember = {
  id: string;
  display: string;
  isStub: boolean;
};

// Admin-only: sign up another guild member for this event. Same field
// set as the self-signup form. Audit log records actor + target so it's
// clear who acted on whose behalf.
export function AdminSignupOnBehalfForm({
  eventId,
  squad1Name,
  squad2Name,
  leadershipSlots,
  singleSquad,
  members,
}: {
  eventId: string;
  squad1Name: string;
  squad2Name: string;
  leadershipSlots: number;
  // Scrim events: only one squad.
  singleSquad: boolean;
  // Members eligible to sign up — already filtered server-side to exclude
  // anyone who has an active signup on this event.
  members: EligibleMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [firstChoice, setFirstChoice] = useState<"squad1" | "squad2">("squad1");
  const [willingBackup, setWillingBackup] = useState(true);
  const [requestLeadership, setRequestLeadership] = useState(false);
  const [leadershipNote, setLeadershipNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSubmitting(true);

    const body = singleSquad
      ? {
          eventId,
          userId,
          squad1Preference: 1,
          squad2Preference: null,
          willingBackup,
          requestLeadership,
          leadershipNote: requestLeadership ? leadershipNote : null,
        }
      : {
          eventId,
          userId,
          squad1Preference: firstChoice === "squad1" ? 1 : 2,
          squad2Preference: firstChoice === "squad2" ? 1 : 2,
          willingBackup,
          requestLeadership,
          leadershipNote: requestLeadership ? leadershipNote : null,
        };

    const res = await fetch("/api/admin/signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setUserId("");
      setRequestLeadership(false);
      setLeadershipNote("");
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={members.length === 0}
        className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
        title={
          members.length === 0
            ? "All current guild members are already signed up."
            : undefined
        }
      >
        + Sign up player on behalf
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Sign up player on behalf
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Creates a signup attributed to the chosen player. Your identity is
        recorded in the audit log.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Player</label>
        <select
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="">Select a player…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display}
              {m.isStub ? " (pre-claim)" : ""}
            </option>
          ))}
        </select>
      </div>

      {!singleSquad && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Squad preference (first choice)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="firstChoice"
                value="squad1"
                checked={firstChoice === "squad1"}
                onChange={() => setFirstChoice("squad1")}
              />
              <span>{squad1Name}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="firstChoice"
                value="squad2"
                checked={firstChoice === "squad2"}
                onChange={() => setFirstChoice("squad2")}
              />
              <span>{squad2Name}</span>
            </label>
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={willingBackup}
            onChange={(e) => setWillingBackup(e.target.checked)}
          />
          <span>Willing to be a backup if main roster fills</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requestLeadership}
            onChange={(e) => setRequestLeadership(e.target.checked)}
          />
          <span>
            Request leadership ({leadershipSlots}
            {singleSquad ? "" : " per squad"})
          </span>
        </label>
        {requestLeadership && (
          <>
            <textarea
              className="mt-2 w-full rounded-md border p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              placeholder="Reason (optional)"
              value={leadershipNote}
              onChange={(e) => setLeadershipNote(e.target.value)}
              rows={2}
            />
            <FieldHelp>
              Leaders coordinate their squad during the match.
            </FieldHelp>
          </>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !userId}
        className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {submitting ? "Signing up…" : "Sign up player"}
      </button>
    </form>
  );
}
