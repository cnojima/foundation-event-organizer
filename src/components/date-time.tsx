"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const useIsHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

type Mode = "datetime" | "date";

type Props = {
  iso: string;
  mode?: Mode;
  /** Show UTC equivalent alongside local time. Defaults true for datetime, ignored for date-only. */
  showUTC?: boolean;
  className?: string;
};

/**
 * Renders an ISO datetime in the user's local timezone with the TZ abbreviation,
 * with the UTC equivalent in light text alongside (datetime mode only).
 *
 * Database stores dates as UTC ISO strings. On the server the user's TZ is unknown,
 * so the first paint shows the UTC value. After hydration `useEffect` re-renders
 * in the browser's local TZ — no hydration mismatch since both render `utc` first.
 */
export function DateTime({
  iso,
  mode = "datetime",
  showUTC = true,
  className,
}: Props) {
  const hydrated = useIsHydrated();
  const utc = formatUTC(iso, mode);

  if (!hydrated) {
    return <span className={className}>{utc} UTC</span>;
  }

  const local = formatLocal(iso, mode);
  return (
    <span className={className}>
      {local}
      {showUTC && mode === "datetime" && (
        <span className="ml-1 text-xs text-gray-400">({utc} UTC)</span>
      )}
    </span>
  );
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function formatLocal(iso: string, mode: Mode): string {
  const d = new Date(iso);
  if (mode === "date") return d.toLocaleDateString();
  return d.toLocaleString(undefined, {
    ...DATETIME_OPTS,
    timeZoneName: "short",
  });
}

function formatUTC(iso: string, mode: Mode): string {
  const d = new Date(iso);
  if (mode === "date") {
    return d.toLocaleDateString("en-US", { timeZone: "UTC" });
  }
  return d.toLocaleString("en-US", {
    ...DATETIME_OPTS,
    hour: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
