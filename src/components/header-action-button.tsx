// Shared visual styling for the "header action" pill buttons that sit at
// the top of detail pages (Edit dates, Add to Calendar, Delete Event…).
// Centralized to prevent the violet/red variants from drifting out of
// sync — adding new colors here keeps every consumer aligned in one edit.
//
// Class strings are full literals per color so the Tailwind JIT can
// statically discover them. Interpolated forms like `border-${c}-200`
// would be silently skipped by the compiler.

export type HeaderActionColor = "violet" | "red";

const BASE =
  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium";

const COLOR_CLASSES: Record<HeaderActionColor, string> = {
  violet:
    "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60",
  red:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60",
};

// `extra` is for one-off additions like `disabled:opacity-60` on a button
// that has a disabled state. Keep this list short — anything broadly
// reusable belongs in BASE.
export function headerActionClasses(
  color: HeaderActionColor,
  extra?: string
): string {
  return [BASE, COLOR_CLASSES[color], extra].filter(Boolean).join(" ");
}
