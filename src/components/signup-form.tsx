"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

interface Event {
  id: string;
  squad1Name: string;
  squad2Name: string;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
  leadershipSlots: number;
}

function formatStart(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Signup {
  id: string;
  squad1Preference: number | null;
  squad2Preference: number | null;
  willingBackup: boolean | null;
  requestLeadership: boolean | null;
  leadershipNote: string | null;
}

export function SignupForm({
  event,
  existing,
  singleSquad = false,
}: {
  event: Event;
  existing: Signup | null;
  // Scrim events: only one squad to sign up for. Hides the preference picker
  // and submits squad1Preference=1, squad2Preference=null.
  singleSquad?: boolean;
}) {
  const router = useRouter();
  const [firstChoice, setFirstChoice] = useState<string>(
    existing?.squad1Preference === 1
      ? "squad1"
      : existing?.squad2Preference === 1
        ? "squad2"
        : "squad1"
  );
  const [willingBackup, setWillingBackup] = useState(
    existing?.willingBackup ?? true
  );
  const [requestLeadership, setRequestLeadership] = useState(
    existing?.requestLeadership ?? false
  );
  const [leadershipNote, setLeadershipNote] = useState(
    existing?.leadershipNote ?? ""
  );
  const [submitting, setSubmitting] = useState(false);

  const secondChoice = firstChoice === "squad1" ? "squad2" : "squad1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const body = singleSquad
      ? {
          eventId: event.id,
          squad1Preference: 1,
          squad2Preference: null,
          willingBackup,
          requestLeadership,
          leadershipNote: requestLeadership ? leadershipNote : null,
        }
      : {
          eventId: event.id,
          squad1Preference: firstChoice === "squad1" ? 1 : 2,
          squad2Preference: firstChoice === "squad2" ? 1 : 2,
          willingBackup,
          requestLeadership,
          leadershipNote: requestLeadership ? leadershipNote : null,
        };

    const res = await fetch("/api/signups", {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing ? { ...body, id: existing.id } : body),
    });

    if (res.ok) {
      router.refresh();
    } else {
      alert("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!singleSquad && (
        <div>
          <label className="block font-medium mb-2">
            Squad Preference (first choice)
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
              <span>
                {event.squad1Name}
                <span className="ml-2 text-xs text-gray-500">
                  — {formatStart(event.squad1StartsAt)}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="firstChoice"
                value="squad2"
                checked={firstChoice === "squad2"}
                onChange={() => setFirstChoice("squad2")}
              />
              <span>
                {event.squad2Name}
                <span className="ml-2 text-xs text-gray-500">
                  — {formatStart(event.squad2StartsAt)}
                </span>
              </span>
            </label>
          </div>
          <FieldHelp>
            Pick the squad you most want to play on. If your first choice is
            full, admins will try to place you on your second choice ({" "}
            {secondChoice === "squad1" ? event.squad1Name : event.squad2Name}).
          </FieldHelp>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={willingBackup}
            onChange={(e) => setWillingBackup(e.target.checked)}
          />
          <span>Willing to be a backup player if main roster is full</span>
        </label>
        <FieldHelp>
          Backups fill in if a main-roster player drops. Uncheck if you only
          want to play if you get a starting slot.
        </FieldHelp>
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requestLeadership}
            onChange={(e) => setRequestLeadership(e.target.checked)}
          />
          <span>
            Request a leadership position ({event.leadershipSlots}
            {singleSquad ? "" : " per squad"})
          </span>
        </label>
        <FieldHelp>
          Leaders coordinate their squad during the match. Admins choose who
          gets the role from the requests.
        </FieldHelp>
        {requestLeadership && (
          <textarea
            className="mt-2 w-full border rounded-md p-2 text-sm"
            placeholder="Why would you like a leadership role? (optional)"
            value={leadershipNote}
            onChange={(e) => setLeadershipNote(e.target.value)}
            rows={2}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting
          ? "Saving..."
          : existing
            ? "Update Signup"
            : "Sign Up"}
      </button>
    </form>
  );
}
