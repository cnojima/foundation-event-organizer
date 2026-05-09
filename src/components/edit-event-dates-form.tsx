"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/field-help";

type DateField = "gameTime" | "signupOpens" | "signupCloses";

const FIELDS: {
  key: DateField;
  label: string;
  help: string;
}[] = [
  {
    key: "gameTime",
    label: "Game Time",
    help: "When the match begins. Used for the calendar download.",
  },
  {
    key: "signupOpens",
    label: "Signup Opens",
    help: "When players can start signing up. Leave blank to open immediately.",
  },
  {
    key: "signupCloses",
    label: "Signup Closes",
    help: "When the signup form locks. Leave blank for no deadline.",
  },
];

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in local time.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function EditEventDatesForm({
  eventId,
  kind,
  gameTime,
  signupOpens,
  signupCloses,
}: {
  eventId: string;
  kind: "match" | "simple";
  gameTime: string | null;
  signupOpens: string | null;
  signupCloses: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const initial = {
    gameTime: isoToLocalInput(gameTime),
    signupOpens: isoToLocalInput(signupOpens),
    signupCloses: isoToLocalInput(signupCloses),
  };
  const [values, setValues] = useState(initial);

  const visibleFields =
    kind === "match" ? FIELDS : FIELDS.filter((f) => f.key === "gameTime");

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
    for (const { key } of visibleFields) {
      const v = values[key];
      body[key] = v ? new Date(v).toISOString() : null;
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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
    >
      <div className={`grid gap-3 ${visibleFields.length > 1 ? "grid-cols-3" : "grid-cols-1"}`}>
        {visibleFields.map(({ key, label, help }) => (
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
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <FieldHelp>{help}</FieldHelp>
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
