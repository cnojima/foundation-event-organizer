import type { DuplicateMatch } from "@/lib/migration-dedupe";

const REASON_LABEL: Record<DuplicateMatch["reason"], string> = {
  gameUid: "same Game UID",
  nameAndServer: "same name + source server",
};

// Plain presentational component (no next-intl of its own) since it's used
// from both a server component (the closed-window roster table) and a
// client component (MigrationQueueRow) — callers pass an already-translated
// label using whichever translation API fits their context.
export function DuplicateBadge({
  matches,
  label,
}: {
  matches: DuplicateMatch[];
  label: string;
}) {
  if (matches.length === 0) return null;
  const title = matches
    .map((m) => `${m.playerName} (${m.status}) — ${REASON_LABEL[m.reason]}`)
    .join("; ");
  return (
    <span
      title={title}
      className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
    >
      ⚠ {label}
    </span>
  );
}
