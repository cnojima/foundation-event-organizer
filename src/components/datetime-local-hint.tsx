"use client";

import { useEffect, useState } from "react";

// Helper line under a UTC-mode <input type="datetime-local">. The input
// itself is wall-clock UTC (e.g. "14:00" means 14:00 UTC); this hint
// translates that to the viewer's local time so they can sanity-check
// without doing TZ math in their head.
export function DatetimeLocalHint({ value }: { value: string }) {
  const [local, setLocal] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);

  // Client-only: localized rendering depends on the visitor's TZ + locale.
  useEffect(() => {
    setZone(detectTimezoneLabel());
    setLocal(formatLocal(value));
  }, [value]);

  return (
    <p className="mt-1 text-xs text-gray-500">
      <span>UTC.</span>
      {local && (
        <>
          {" "}
          <span>
            Your local time{zone ? ` (${zone})` : ""}:{" "}
            <span className="font-mono">{local}</span>.
          </span>
        </>
      )}
    </p>
  );
}

function detectTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "local";
  } catch {
    return "local";
  }
}

function formatLocal(utcInput: string): string | null {
  if (!utcInput) return null;
  const d = new Date(`${utcInput}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
