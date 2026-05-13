"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";
import { DatetimeLocalHint } from "@/components/datetime-local-hint";

type DateField =
  | "gameTime"
  | "signupOpens"
  | "signupCloses"
  | "squad1StartsAt"
  | "squad2StartsAt";

const FIELD_HELP: Record<DateField, string> = {
  gameTime: "When the event starts. Used for the calendar download.",
  signupOpens: "When players can start signing up. Leave blank to open immediately.",
  signupCloses: "When the signup form locks. Leave blank for no deadline.",
  squad1StartsAt: "When this squad plays. Leave blank if not scheduled yet.",
  squad2StartsAt: "When this squad plays. Leave blank if not scheduled yet.",
};

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM". This app treats
// the input as UTC wall-clock — what you type is what's saved.
function isoToUtcInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function utcInputToIso(input: string): string | null {
  if (!input) return null;
  const d = new Date(`${input}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EditEventDatesForm({
  eventId,
  kind,
  squad1Name,
  squad2Name,
  gameTime,
  signupOpens,
  signupCloses,
  squad1StartsAt,
  squad2StartsAt,
}: {
  eventId: string;
  kind: "match" | "simple";
  squad1Name: string;
  squad2Name: string;
  gameTime: string | null;
  signupOpens: string | null;
  signupCloses: string | null;
  squad1StartsAt: string | null;
  squad2StartsAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initial = {
    gameTime: isoToUtcInput(gameTime),
    signupOpens: isoToUtcInput(signupOpens),
    signupCloses: isoToUtcInput(signupCloses),
    squad1StartsAt: isoToUtcInput(squad1StartsAt),
    squad2StartsAt: isoToUtcInput(squad2StartsAt),
  };
  const [values, setValues] = useState(initial);

  // Per-kind field set. Match events show signup window + per-squad starts.
  // Simple events show single Start Time only.
  const fields: { key: DateField; label: string }[] =
    kind === "match"
      ? [
          { key: "signupOpens", label: "Signup Opens" },
          { key: "signupCloses", label: "Signup Closes" },
          { key: "squad1StartsAt", label: `${squad1Name} Starts At` },
          { key: "squad2StartsAt", label: `${squad2Name} Starts At` },
        ]
      : [{ key: "gameTime", label: "Start Time" }];

  function reset() {
    setValues(initial);
    setError(null);
    setEditing(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, string | null> = {};
    for (const { key } of fields) {
      body[key] = utcInputToIso(values[key]);
    }

    const res = await fetch(`/api/admin/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSavedAt(Date.now());
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed");
    }
    setSubmitting(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Edit dates
        </button>
        {savedAt && <span className="text-xs text-emerald-600">Saved.</span>}
      </div>
    );
  }

  const colsClass =
    fields.length >= 4
      ? "grid-cols-2"
      : fields.length === 3
        ? "grid-cols-3"
        : "grid-cols-1";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
    >
      <div className={`grid gap-3 ${colsClass}`}>
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {label}
            </label>
            <input
              type="datetime-local"
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
              // 10-minute increments: picker shows :00, :10, :20, :30, :40, :50.
              step={600}
              // Render picker in 24-hour / DD-MM-YYYY format — see
              // DatetimeLocalField for the rationale.
              lang="en-GB"
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <DatetimeLocalHint value={values[key]} />
            <FieldHelp>{FIELD_HELP[key]}</FieldHelp>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={submitting}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
