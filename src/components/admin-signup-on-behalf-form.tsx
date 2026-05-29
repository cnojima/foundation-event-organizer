"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type EligibleMember = {
  id: string;
  display: string;
  isStub: boolean;
};

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
  singleSquad: boolean;
  members: EligibleMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
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
        + Sign up players on behalf
      </button>
      {open && (
        <SignupOnBehalfModal
          eventId={eventId}
          squad1Name={squad1Name}
          squad2Name={squad2Name}
          leadershipSlots={leadershipSlots}
          singleSquad={singleSquad}
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

function SignupOnBehalfModal({
  eventId,
  squad1Name,
  squad2Name,
  leadershipSlots,
  singleSquad,
  members,
  onClose,
  onDone,
}: {
  eventId: string;
  squad1Name: string;
  squad2Name: string;
  leadershipSlots: number;
  singleSquad: boolean;
  members: EligibleMember[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [firstChoice, setFirstChoice] = useState<"squad1" | "squad2">("squad1");
  const [willingBackup, setWillingBackup] = useState(true);
  const [requestLeadership, setRequestLeadership] = useState(false);
  const [leadershipNote, setLeadershipNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    for (let i = 0; i < ids.length; i++) {
      const userId = ids[i];
      const body = singleSquad
        ? {
            eventId,
            userId,
            squad1Preference: 1,
            squad2Preference: null,
            willingBackup,
            requestLeadership,
            leadershipNote: requestLeadership && leadershipNote ? leadershipNote : null,
          }
        : {
            eventId,
            userId,
            squad1Preference: firstChoice === "squad1" ? 1 : 2,
            squad2Preference: firstChoice === "squad2" ? 1 : 2,
            willingBackup,
            requestLeadership,
            leadershipNote: requestLeadership && leadershipNote ? leadershipNote : null,
          };
      const res = await fetch("/api/admin/signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      aria-labelledby="behalf-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h2
              id="behalf-title"
              className="text-lg font-bold text-gray-900 dark:text-gray-100"
            >
              Sign up players on behalf
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Creates signups attributed to the chosen players. Your identity is
              recorded in the audit log.
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
          <label htmlFor="behalf-q" className="sr-only">
            Search members
          </label>
          <input
            id="behalf-q"
            type="text"
            placeholder="Filter by in-game name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={submitting}
            autoFocus
            className="w-full rounded border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        <div className="max-h-[35vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              {members.length === 0
                ? "No eligible members — everyone is already signed up."
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

        <div className="border-t border-gray-200 p-4 dark:border-gray-800 space-y-3">
          {!singleSquad && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                Squad preference (first choice)
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="behalf-firstChoice"
                    value="squad1"
                    checked={firstChoice === "squad1"}
                    onChange={() => setFirstChoice("squad1")}
                    disabled={submitting}
                  />
                  <span>{squad1Name}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="behalf-firstChoice"
                    value="squad2"
                    checked={firstChoice === "squad2"}
                    onChange={() => setFirstChoice("squad2")}
                    disabled={submitting}
                  />
                  <span>{squad2Name}</span>
                </label>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={willingBackup}
              onChange={(e) => setWillingBackup(e.target.checked)}
              disabled={submitting}
            />
            <span>Willing to be a backup if main roster fills</span>
          </label>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requestLeadership}
                onChange={(e) => setRequestLeadership(e.target.checked)}
                disabled={submitting}
              />
              <span>
                Request leadership ({leadershipSlots}
                {singleSquad ? "" : " per squad"})
              </span>
            </label>
            {requestLeadership && (
              <textarea
                className="mt-2 w-full rounded-md border p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                placeholder="Reason (optional)"
                value={leadershipNote}
                onChange={(e) => setLeadershipNote(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            )}
          </div>
        </div>

        {error && (
          <p className="mx-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {progress
              ? `Signing up ${progress.done} of ${progress.total}…`
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
                ? "Signing up…"
                : `Sign up${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
