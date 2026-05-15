// Pure helpers + constants used by both the server (API + seed) and the
// client (admin form + create-event picker). Lives in a separate file from
// event-templates.ts so client bundles don't transitively pull in the DB
// module — importing anything from event-templates.ts forces Webpack to
// bundle better-sqlite3 for the browser, which fails on `fs`.

// Returns the absolute UTC ISO timestamp for the latest weekday-at-time
// occurrence that lands at or before `anchorIso`. Used at template-apply
// time to snap "Monday 00:00 UTC" against an event's Saturday start.
//
// Example: anchor = 2026-05-16T14:00:00Z (Saturday), weekday = 1 (Monday),
// timeUtc = "00:00" → returns 2026-05-11T00:00:00Z (previous Monday).
export function snapSignupTime(
  anchorIso: string,
  weekday: number,
  timeUtc: string
): string | null {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(timeUtc);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  // Start from the anchor's UTC date, set the time-of-day, then step back
  // to the most recent matching weekday (including the anchor's own day
  // if the snapped time hasn't passed yet).
  const candidate = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
      hours,
      minutes,
      0,
      0
    )
  );
  const currentWeekday = candidate.getUTCDay();
  let dayDelta = (currentWeekday - weekday + 7) % 7;
  // If same weekday but the snapped time is *after* the anchor, step back
  // a full week so we never return a value that's later than the anchor.
  if (dayDelta === 0 && candidate.getTime() > anchor.getTime()) dayDelta = 7;
  candidate.setUTCDate(candidate.getUTCDate() - dayDelta);
  return candidate.toISOString();
}

// Tiny validators reused by API + admin form. Kept inline (rather than
// pulling in zod) to match the codebase style.
export function isValidWeekday(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
}

export function isValidTimeUtc(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// Numeric field limits shared by API validation + admin form constraints.
export const TEMPLATE_LIMITS = {
  templateName: { max: 100 },
  eventName: { max: 200 },
  description: { max: 4000 },
  squadName: { max: 50 },
  maxPlayers: { min: 1, max: 500 },
  maxBackups: { min: 0, max: 500 },
  leadershipSlots: { min: 0, max: 50 },
} as const;

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
