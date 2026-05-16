import type { SVGProps } from "react";

// Hero-style iconography for the four event-detail surfaces. Designed to read
// clearly at large sizes (size-12+) in detail-view headers AND at small sizes
// (size-5/6) when prefixed onto a list card row. All four use a 24-unit
// viewBox + currentColor + matching stroke weight so they sit on the same
// optical baseline.
//
// Visual idiom per kind:
//   match  → two crossed swords (squad-vs-squad, internal team battle)
//   scrim  → two opposing shields with a "vs" bar (guild-vs-guild)
//   simple → calendar with a check mark (info / announcement)
//   duel   → single sword + target ring (1v1)

export type EventKindIconKind = "match" | "scrim" | "simple" | "duel";

type EventKindIconProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & {
  kind: EventKindIconKind;
  // Tailwind size class. Default reads "small inline" — pages opting into
  // the hero treatment pass size-12 / size-14.
  className?: string;
};

export function EventKindIcon({
  kind,
  className = "size-5",
  ...rest
}: EventKindIconProps) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    className,
    ...rest,
  } as const;
  switch (kind) {
    case "match":
      return (
        <svg {...common}>
          {/* Two crossed swords. Blades on the diagonals, pommels at the
              top corners, cross-guards near the top, points dropping to
              the bottom corners. */}
          <line x1="6" y1="4" x2="18" y2="20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <line x1="18" y1="4" x2="6" y2="20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          {/* Cross-guards */}
          <line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Pommels */}
          <circle cx="6" cy="4" r="1.25" fill="currentColor" />
          <circle cx="18" cy="4" r="1.25" fill="currentColor" />
        </svg>
      );
    case "scrim":
      return (
        <svg {...common}>
          {/* Left shield */}
          <path
            d="M3.5 5 L7.5 3.5 L7.5 11 C7.5 14 6 16 5.5 16.5 C5 16 3.5 14 3.5 11 Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Right shield (mirrored) */}
          <path
            d="M20.5 5 L16.5 3.5 L16.5 11 C16.5 14 18 16 18.5 16.5 C19 16 20.5 14 20.5 11 Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* "vs" bar between the two */}
          <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="9.5" x2="11" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="9.5" x2="13" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "simple":
      return (
        <svg {...common}>
          {/* Calendar frame + binding rings */}
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="2.5" x2="8" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="16" y1="2.5" x2="16" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          {/* Check mark in the lower half */}
          <path
            d="M8 15 L11 18 L17 12.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "duel":
      return (
        <svg {...common}>
          {/* Target ring (right side) */}
          <circle cx="17" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="17" cy="7" r="1.25" fill="currentColor" />
          {/* Single sword arriving from lower-left, point touching the
              target ring. Pommel + cross-guard at the bottom-left handle. */}
          <line x1="3" y1="21" x2="14" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <line x1="2" y1="18" x2="6" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="3" cy="21" r="1.25" fill="currentColor" />
        </svg>
      );
  }
}

// Hero treatment for detail-view headers: kind-tinted square with the icon
// centered. Three sizes via `size`:
//   "lg" — 56px tile / 28px icon (the default for event detail headers)
//   "md" — 40px tile / 22px icon
//   "sm" — 28px tile / 16px icon (compact alt for tight headers)
//
// Tint colors mirror the existing kind badges on the listing cards:
// match→violet, scrim→rose, simple→gray, duel→indigo.
const KIND_TINT: Record<EventKindIconKind, string> = {
  match:
    "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  scrim: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  simple: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  duel:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
};

const HERO_SIZES = {
  lg: { tile: "size-14", icon: "size-7" },
  md: { tile: "size-10", icon: "size-[1.375rem]" },
  sm: { tile: "size-7", icon: "size-4" },
} as const;

export function EventKindHero({
  kind,
  size = "lg",
  label,
}: {
  kind: EventKindIconKind;
  size?: keyof typeof HERO_SIZES;
  // Optional accessible name. Defaults to the kind word.
  label?: string;
}) {
  const dims = HERO_SIZES[size];
  return (
    <div
      role="img"
      aria-label={label ?? kind}
      className={`flex ${dims.tile} shrink-0 items-center justify-center rounded-lg ${KIND_TINT[kind]}`}
    >
      <EventKindIcon kind={kind} className={dims.icon} />
    </div>
  );
}
