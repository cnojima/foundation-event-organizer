"use client";

import { useEffect, useState } from "react";

// Renders a small helper line under a <input type="datetime-local"> that
// (1) confirms the input is in the user's local timezone, and (2) shows the
// UTC equivalent of whatever they've entered. Stored values are UTC, so this
// removes the "wait, did I type 18:00 PST or 18:00 UTC?" ambiguity.
export function DatetimeLocalHint({ value }: { value: string }) {
  const [zone, setZone] = useState<string | null>(null);

  // Browser-only — the timezone label depends on the visitor's locale.
  useEffect(() => setZone(detectTimezoneLabel()), []);

  const utc = formatUtc(value);

  return (
    <p className="mt-1 text-xs text-gray-500">
      <span>Your local time{zone ? ` (${zone})` : ""}.</span>
      {utc && (
        <>
          {" "}
          <span>
            Saved as <span className="font-mono">{utc}</span>.
          </span>
        </>
      )}
    </p>
  );
}

function detectTimezoneLabel(): string {
  try {
    // e.g., "PST", "GMT+1". Falls back to "local" if the runtime can't
    // resolve a short name.
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "local";
  } catch {
    return "local";
  }
}

function formatUtc(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
