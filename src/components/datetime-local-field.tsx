"use client";

import { useState } from "react";
import { DatetimeLocalHint } from "./datetime-local-hint";

// Self-contained <input type="datetime-local"> + timezone hint. Tracks its
// own value in state so the hint updates on every keystroke; the underlying
// input still has a `name` so it works with FormData on submit.
export function DatetimeLocalField({
  name,
  defaultValue = "",
  required = false,
  className = "w-full border rounded px-3 py-2",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
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
