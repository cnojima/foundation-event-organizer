"use client";

import { useEffect, useState } from "react";
import { DatetimeLocalHint } from "./datetime-local-hint";

// Self-contained <input type="datetime-local"> + timezone hint. Tracks its
// own value in state so the hint updates on every keystroke; the underlying
// input still has a `name` so it works with FormData on submit.
//
// `defaultUtcIso` is computed in the user's local timezone after mount, which
// is necessary because the <input> only accepts local-time strings and the
// server doesn't know the visitor's TZ. Initial render is empty; useEffect
// fills it once we're in the browser.
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
    setValue(utcIsoToLocalInput(defaultUtcIso));
    // Empty deps — defaultUtcIso is intended as a one-shot initialization
    // hint, not a controlled prop. Re-running on prop changes would clobber
    // user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <input
        name={name}
        type="datetime-local"
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // step in seconds — 600 = 10 minutes, so the picker shows :00, :10,
        // :20, :30, :40, :50 only.
        step={600}
        className={className}
      />
      <DatetimeLocalHint value={value} />
    </>
  );
}

function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
