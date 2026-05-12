"use client";

import { useEffect, useState } from "react";
import { DatetimeLocalHint } from "./datetime-local-hint";

// <input type="datetime-local"> with UTC semantics. What the user types is
// UTC — the picker shows e.g. 14:00 and that becomes 14:00 UTC server-side.
// A hidden sibling input carries the canonical `...Z` ISO string under the
// real `name=`; the visible input is unnamed so FormData reads only the
// hidden one. Forms can keep using `form.get(name)` as if nothing changed.
//
// Server-side `new Date()` parsing was the original bug — Node parses
// no-offset strings as the *server's* local TZ, so 14:00 entered in PT got
// saved as 14:00 UTC on a Fly machine. Forcing the Z suffix on the wire
// removes that ambiguity.
export function DatetimeLocalField({
  name,
  defaultValue = "",
  defaultUtcIso,
  required = false,
  className = "w-full border rounded px-3 py-2",
}: {
  name: string;
  defaultValue?: string;
  defaultUtcIso?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (value || !defaultUtcIso) return;
    setValue(utcIsoToUtcInput(defaultUtcIso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <input
        type="datetime-local"
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // step in seconds — 600 = 10 minutes, so the picker shows :00, :10,
        // :20, :30, :40, :50 only.
        step={600}
        className={className}
      />
      <input type="hidden" name={name} value={utcInputToIso(value)} />
      <DatetimeLocalHint value={value} />
    </>
  );
}

// Extract UTC wall-clock components so the picker displays e.g. "14:00"
// regardless of viewer TZ — that's the value that round-trips to the DB.
function utcIsoToUtcInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function utcInputToIso(localInput: string): string {
  if (!localInput) return "";
  // The visible input emits "YYYY-MM-DDTHH:MM" with no offset. Append `:00Z`
  // so the browser parses it as UTC, then normalize to a full ISO.
  const d = new Date(`${localInput}:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
