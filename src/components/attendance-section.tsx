"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import type { EligibleMember } from "@/components/admin-signup-on-behalf-form";

// Ad-hoc attendance: walk-ins for any event, plus the primary management
// surface for simple events. Each row represents a `signups` row with
// `attendanceOnly = true`. The picker excludes anyone already in any
// active row (signup-bound or attendance-only) to prevent dupes; the
// server also de-dupes idempotently if you race two adds.
//
// Removing a row soft-deletes (`deletedAt = ISO`) so audit history
// survives the unmark.

export type AdhocAttendee = {
  signupId: string;
  userId: string;
  display: string;
  image: string | null;
};

export function AttendanceSection({
  eventId,
  eventDeleted,
  attendees,
  eligibleMembers,
}: {
  eventId: string;
  eventDeleted: boolean;
  attendees: AdhocAttendee[];
  eligibleMembers: EligibleMember[];
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removeAttendee(signupId: string, display: string) {
    if (!confirm(`Remove ${display} from this event's attendance?`)) return;
    setError(null);
    setRemovingId(signupId);
    const res = await fetch(`/api/admin/attendance/${signupId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setRemovingId(null);
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Attendance
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Walk-ins and ad-hoc attendees. Use this for players who showed up
            without signing up, or for simple events with no signup flow.
          </p>
        </div>
        {!eventDeleted && (
          <AddWalkInsButton eventId={eventId} members={eligibleMembers} />
        )}
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {attendees.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No walk-ins recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {attendees.map((a) => (
            <div
              key={a.signupId}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={a.display} image={a.image} />
                <div className="leading-tight">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {a.display}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Walk-in · marked attended
                  </p>
                </div>
              </div>
              {!eventDeleted && (
                <button
                  type="button"
                  onClick={() => removeAttendee(a.signupId, a.display)}
                  disabled={removingId === a.signupId}
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
                >
                  {removingId === a.signupId ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

    </section>
  );
}

// Self-contained "+ Add walk-ins" trigger — opens the modal and refreshes
// the page on success. Reusable on any surface that has the eligibleMembers
// list (admin event page + player event detail).
export function AddWalkInsButton({
  eventId,
  members,
  disabled,
  className,
}: {
  eventId: string;
  members: EligibleMember[];
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || members.length === 0}
        className={
          className ??
          "rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
        }
        title={
          members.length === 0
            ? "Every guild member is already on the roster or attendance list."
            : undefined
        }
      >
        + Add walk-ins
      </button>
      {open && (
        <AddWalkInsModal
          eventId={eventId}
          members={members}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function AddWalkInsModal({
  eventId,
  members,
  onClose,
  onDone,
}: {
  eventId: string;
  members: EligibleMember[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Close on Escape — common dialog affordance.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.display.toLowerCase().includes(q));
  }, [query, members]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((m) => selected.has(m.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const m of filtered) next.delete(m.id);
      } else {
        for (const m of filtered) next.add(m.id);
      }
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setError(null);
    setSubmitting(true);
    const ids = Array.from(selected);
    setProgress({ done: 0, total: ids.length });
    // Sequential POSTs — the endpoint is idempotent server-side, so an
    // interrupted batch leaves the DB consistent. Volumes here are small
    // (handful of walk-ins per event), so the extra round-trips aren't a
    // hot path; if it ever matters, the API can grow batch support.
    for (let i = 0; i < ids.length; i++) {
      const userId = ids[i];
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          `Stopped after ${i} of ${ids.length}: ${data?.error ?? "request failed"}`
        );
        setSubmitting(false);
        setProgress(null);
        return;
      }
      setProgress({ done: i + 1, total: ids.length });
    }
    setProgress(null);
    setSubmitting(false);
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkin-title"
      onClick={(e) => {
        // Backdrop click closes — only when the click target is the
        // backdrop itself, not bubbled from inside the panel.
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h2
              id="walkin-title"
              className="text-lg font-bold text-gray-900 dark:text-gray-100"
            >
              Add walk-ins
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Select members who attended without signing up.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="border-b border-gray-200 p-4 dark:border-gray-800">
          <label htmlFor="walkin-q" className="sr-only">
            Search members
          </label>
          <input
            id="walkin-q"
            type="text"
            placeholder="Filter by in-game name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={submitting}
            autoFocus
            className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              {members.length === 0
                ? "No eligible members — everyone is already on the roster or attendance list."
                : "No members match that filter."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-800">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected;
                      }}
                      onChange={toggleAllFiltered}
                      disabled={submitting || filtered.length === 0}
                      aria-label="Select all in current filter"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                    Member
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <tr
                      key={m.id}
                      className={`cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-violet-50/50 dark:border-gray-800 dark:hover:bg-violet-950/30 ${checked ? "bg-violet-50 dark:bg-violet-950/40" : ""}`}
                      onClick={() => !submitting && toggle(m.id)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(m.id)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={submitting}
                          aria-label={`Select ${m.display}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        {m.display}
                        {m.isStub && (
                          <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                            Pre-claim
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {error && (
          <p className="mx-4 mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {progress
              ? `Adding ${progress.done} of ${progress.total}…`
              : `${selected.size} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || selected.size === 0}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {submitting
                ? "Adding…"
                : `Mark attended${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
