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

// Adds a whole number of weeks to an ISO timestamp. Used to step a
// recurring template's anchor forward — since the anchor already sits at
// the target weekday+time, adding N*7 days preserves both.
export function addWeeksToIso(iso: string, weeks: number): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
}

// The next UTC occurrence of `weekday` at `timeUtc` that is at or after
// `from`. Used to pre-fill a recurring template's first occurrence — e.g.
// anchor weekday=1 (Monday), timeUtc="18:00" → the coming Monday at 18:00
// UTC, or the following Monday if today is already past that time.
export function nextWeekdayAtTimeUtc(
  weekday: number,
  timeUtc: string,
  from = new Date()
): string | null {
  if (!isValidWeekday(weekday) || !isValidTimeUtc(timeUtc)) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(timeUtc);
  if (!match) return null;
  const candidate = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
      0,
      0
    )
  );
  let dayDelta = (weekday - candidate.getUTCDay() + 7) % 7;
  if (dayDelta === 0 && candidate.getTime() <= from.getTime()) dayDelta = 7;
  candidate.setUTCDate(candidate.getUTCDate() + dayDelta);
  return candidate.toISOString();
}

// Replaces the time-of-day of `dateIso` (keeping its own UTC calendar date)
// with `timeUtc` ("HH:MM"). Used to derive a match occurrence's squad2 start
// from its squad1 start, which anchors the week.
export function withTimeUtc(dateIso: string, timeUtc: string): string | null {
  if (!isValidTimeUtc(timeUtc)) return null;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(timeUtc);
  if (!match) return null;
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
      0,
      0
    )
  ).toISOString();
}

// Numeric field limits shared by API validation + admin form constraints.
export const DURATION_OPTIONS = [
  { label: "Not set", value: "" },
  { label: "30 min", value: "30" },
  { label: "1 hour", value: "60" },
  { label: "1.5 hours", value: "90" },
  { label: "2 hours", value: "120" },
  { label: "3 hours", value: "180" },
  { label: "4 hours", value: "240" },
] as const;

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

// Client-facing shape of an event_templates row — the admin form and the
// create-event picker both consume this. Narrower than the Drizzle row:
// drops guildId/createdAt/deletedAt and the generator-only bookkeeping
// fields (recurrenceLastGeneratedStartAt, recurrenceOccurrencesGenerated),
// none of which the UI needs.
export type AdminTemplate = {
  id: string;
  templateName: string;
  eventName: string;
  description: string | null;
  kind: "match" | "simple";
  squad1Name: string;
  squad2Name: string;
  maxPlayers: number;
  maxBackups: number;
  leadershipSlots: number;
  durationMinutes: number | null;
  signupOpensWeekday: number | null;
  signupOpensTimeUtc: string | null;
  signupClosesWeekday: number | null;
  signupClosesTimeUtc: string | null;
  isRecurring: boolean;
  recurrenceIntervalWeeks: number | null;
  recurrenceAnchorWeekday: number | null;
  recurrenceStartTimeUtc: string | null;
  recurrenceSquad1TimeUtc: string | null;
  recurrenceSquad2TimeUtc: string | null;
  recurrenceEndType: "never" | "after_count" | "until_date" | null;
  recurrenceCount: number | null;
  recurrenceUntil: string | null;
  seriesActive: boolean;
};

// Narrows a full event_templates row (or anything with at least these
// fields) down to the AdminTemplate shape sent to the client. Shared by
// every server page that lists templates for the admin form or the
// create-event picker, so a new field only needs to be threaded through
// once.
export function toAdminTemplate(row: AdminTemplate): AdminTemplate {
  return {
    id: row.id,
    templateName: row.templateName,
    eventName: row.eventName,
    description: row.description,
    kind: row.kind,
    squad1Name: row.squad1Name,
    squad2Name: row.squad2Name,
    maxPlayers: row.maxPlayers,
    maxBackups: row.maxBackups,
    leadershipSlots: row.leadershipSlots,
    durationMinutes: row.durationMinutes,
    signupOpensWeekday: row.signupOpensWeekday,
    signupOpensTimeUtc: row.signupOpensTimeUtc,
    signupClosesWeekday: row.signupClosesWeekday,
    signupClosesTimeUtc: row.signupClosesTimeUtc,
    isRecurring: row.isRecurring,
    recurrenceIntervalWeeks: row.recurrenceIntervalWeeks,
    recurrenceAnchorWeekday: row.recurrenceAnchorWeekday,
    recurrenceStartTimeUtc: row.recurrenceStartTimeUtc,
    recurrenceSquad1TimeUtc: row.recurrenceSquad1TimeUtc,
    recurrenceSquad2TimeUtc: row.recurrenceSquad2TimeUtc,
    recurrenceEndType: row.recurrenceEndType,
    recurrenceCount: row.recurrenceCount,
    recurrenceUntil: row.recurrenceUntil,
    seriesActive: row.seriesActive,
  };
}
