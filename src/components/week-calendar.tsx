"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import Link from "next/link";

export type CalendarEntry = {
  eventId: string;
  name: string;
  kind: "match" | "simple" | "scrim";
  startIso: string;
  endIso: string;
  label: string | null;
};

type LayoutEntry = CalendarEntry & { lane: number; totalLanes: number };

// 64px per hour → 1px ≈ 0.9375 min. Gives enough height to read short event
// names without making the grid oppressively tall.
const PX_PER_MIN = 64 / 60;
const TOTAL_HEIGHT = 24 * 64; // full 24-hour day in px

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const KIND_STYLE: Record<
  "match" | "simple" | "scrim",
  { bg: string; bar: string; text: string }
> = {
  match: {
    bg: "bg-violet-50 dark:bg-violet-950/60",
    bar: "bg-violet-500",
    text: "text-violet-900 dark:text-violet-100",
  },
  scrim: {
    bg: "bg-rose-50 dark:bg-rose-950/60",
    bar: "bg-rose-500",
    text: "text-rose-900 dark:text-rose-100",
  },
  simple: {
    bg: "bg-blue-50 dark:bg-blue-950/60",
    bar: "bg-blue-500",
    text: "text-blue-900 dark:text-blue-100",
  },
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function overlaps(a: CalendarEntry, b: CalendarEntry): boolean {
  return (
    new Date(a.startIso) < new Date(b.endIso) &&
    new Date(b.startIso) < new Date(a.endIso)
  );
}

// Groups overlapping events into connected components, assigns lanes within
// each group, and returns a totalLanes count per event so blocks can be
// sized to avoid overlap.
function layoutDay(entries: CalendarEntry[]): LayoutEntry[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort(
    (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime()
  );
  const n = sorted.length;

  // Union-Find to group overlapping events into clusters
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x: number, y: number) {
    parent[find(x)] = find(y);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(sorted[i], sorted[j])) union(i, j);
    }
  }

  // Group indices by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  const lanes = new Array(n).fill(0);
  const totalLanesArr = new Array(n).fill(1);

  for (const indices of clusters.values()) {
    // Within each cluster, assign lanes greedily by earliest start
    const clusterSorted = [...indices].sort(
      (a, b) =>
        new Date(sorted[a].startIso).getTime() -
        new Date(sorted[b].startIso).getTime()
    );
    const laneEnds: number[] = [];
    for (const idx of clusterSorted) {
      const start = new Date(sorted[idx].startIso).getTime();
      const end = new Date(sorted[idx].endIso).getTime();
      let lane = laneEnds.findIndex((e) => e <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      lanes[idx] = lane;
    }
    const total = laneEnds.length;
    for (const idx of indices) totalLanesArr[idx] = total;
  }

  return sorted.map((entry, i) => ({
    ...entry,
    lane: lanes[i],
    totalLanes: totalLanesArr[i],
  }));
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// ---- Component ----

export function WeekCalendar({
  entries,
  unscheduled,
}: {
  entries: CalendarEntry[];
  unscheduled: { eventId: string; name: string; kind: string }[];
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 7 AM on first render so prime-time events are visible.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * 64;
    }
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Group entries by which day column they fall in
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarEntry[]>();
    for (const entry of entries) {
      const start = new Date(entry.startIso);
      for (let i = 0; i < 7; i++) {
        if (sameDay(start, days[i])) {
          if (!map.has(i)) map.set(i, []);
          map.get(i)!.push(entry);
          break;
        }
      }
    }
    return map;
  }, [entries, days]);

  // Count scheduling conflicts (pairs of overlapping entries) for the week
  const conflictCount = useMemo(() => {
    let n = 0;
    for (const dayEntries of byDay.values()) {
      for (let i = 0; i < dayEntries.length; i++) {
        for (let j = i + 1; j < dayEntries.length; j++) {
          if (overlaps(dayEntries[i], dayEntries[j])) n++;
        }
      }
    }
    return n;
  }, [byDay]);

  const weekLabel = (() => {
    const end = addDays(weekStart, 6);
    const d1 = weekStart.getDate();
    const m1 = MONTH_NAMES[weekStart.getMonth()];
    const d2 = end.getDate();
    const m2 = MONTH_NAMES[end.getMonth()];
    const yr = weekStart.getFullYear();
    return weekStart.getMonth() === end.getMonth()
      ? `${d1}–${d2} ${m1} ${yr}`
      : `${d1} ${m1} – ${d2} ${m2} ${yr}`;
  })();

  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="rounded border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Next →
          </button>
        </div>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {weekLabel}
        </span>
        {conflictCount > 0 && (
          <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            ⚠️ {conflictCount} overlap{conflictCount > 1 ? "s" : ""} this week
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        {/* Day headers (sticky) */}
        <div
          className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
          style={{ paddingLeft: 48 }} // match time-gutter width
        >
          {days.map((day, i) => {
            const isToday = sameDay(day, today);
            return (
              <div
                key={i}
                className={`flex-1 border-l border-gray-200 px-1 py-2 text-center text-xs font-semibold first:border-l-0 dark:border-gray-800 ${
                  isToday
                    ? "text-violet-700 dark:text-violet-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <div>{DAY_NAMES[i]}</div>
                <div
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? "bg-violet-600 font-bold text-white"
                      : "font-medium"
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable time body */}
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: 560 }}
        >
          <div className="relative flex" style={{ height: TOTAL_HEIGHT }}>
            {/* Time gutter */}
            <div
              className="relative shrink-0 border-r border-gray-200 dark:border-gray-800"
              style={{ width: 48, height: TOTAL_HEIGHT }}
            >
              {HOURS.map((h) =>
                h === 0 ? null : (
                  <span
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[9px] text-gray-400 dark:text-gray-500"
                    style={{ top: h * 64 }}
                  >
                    {formatHour(h)}
                  </span>
                )
              )}
            </div>

            {/* Day columns */}
            {days.map((day, dayIdx) => {
              const dayEntries = byDay.get(dayIdx) ?? [];
              const laidOut = layoutDay(dayEntries);
              const isToday = sameDay(day, today);

              return (
                <div
                  key={dayIdx}
                  className={`relative flex-1 border-l border-gray-200 first:border-l-0 dark:border-gray-800 ${
                    isToday ? "bg-violet-50/30 dark:bg-violet-950/10" : ""
                  }`}
                  style={{ height: TOTAL_HEIGHT }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-gray-100 dark:border-gray-800"
                      style={{ top: h * 64 }}
                    />
                  ))}
                  {/* Half-hour tick lines */}
                  {HOURS.map((h) => (
                    <div
                      key={`h${h}`}
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-100/70 dark:border-gray-800/50"
                      style={{ top: h * 64 + 32 }}
                    />
                  ))}

                  {/* Current-time indicator */}
                  {isToday && (() => {
                    const now = new Date();
                    const top = (now.getHours() * 60 + now.getMinutes()) * PX_PER_MIN;
                    return (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-violet-500"
                        style={{ top }}
                      >
                        <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-violet-500" />
                      </div>
                    );
                  })()}

                  {/* Event blocks */}
                  {laidOut.map((entry, blockIdx) => {
                    const start = new Date(entry.startIso);
                    const end = new Date(entry.endIso);
                    const startMin = start.getHours() * 60 + start.getMinutes();
                    const endMin = end.getHours() * 60 + end.getMinutes();
                    const top = startMin * PX_PER_MIN;
                    const height = Math.max((endMin - startMin) * PX_PER_MIN, 18);
                    const colW = 100 / entry.totalLanes;
                    const s = KIND_STYLE[entry.kind];
                    const isConflict = entry.totalLanes > 1;

                    return (
                      <Link
                        key={`${entry.eventId}-${blockIdx}`}
                        href={`/event/${entry.eventId}`}
                        title={
                          entry.label
                            ? `${entry.name} — ${entry.label}`
                            : entry.name
                        }
                        className={`absolute overflow-hidden rounded-sm pl-1.5 pr-0.5 pt-0.5 text-[11px] leading-tight transition-opacity hover:opacity-80 ${s.bg} ${s.text} ${
                          isConflict
                            ? "ring-1 ring-amber-400 dark:ring-amber-600"
                            : ""
                        }`}
                        style={{
                          top,
                          height,
                          left: `${entry.lane * colW}%`,
                          width: `${colW}%`,
                        }}
                      >
                        {/* Left color bar */}
                        <span
                          className={`pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-sm ${s.bar}`}
                        />
                        <span className="block truncate pl-0.5 font-semibold">
                          {entry.name}
                        </span>
                        {entry.label && (
                          <span className="block truncate pl-0.5 opacity-70">
                            {entry.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unscheduled events */}
      {unscheduled.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Not yet scheduled
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((e) => {
              const s = KIND_STYLE[e.kind as "match" | "simple" | "scrim"] ?? KIND_STYLE.simple;
              return (
                <Link
                  key={e.eventId}
                  href={`/event/${e.eventId}`}
                  className={`rounded border border-gray-200 px-2 py-1 text-xs font-medium dark:border-gray-700 ${s.text}`}
                >
                  {e.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
