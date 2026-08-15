import type { DuplicateMatch } from "@/lib/migration-dedupe";

const REASON_LABEL: Record<DuplicateMatch["reasons"][number], string> = {
  gameUid: "same Game UID",
  nameAndServer: "same name + source server",
};

// Shared anchor id so the badge's links and the row itself agree on a
// target — used by both MigrationQueueRow and the closed-window roster
// table. A link only actually scrolls anywhere if the matched application
// is rendered on the current page; while a window is open, decided
// applications (accepted/denied/etc.) aren't shown at all, so a match
// against one of those is still surfaced via the tooltip/label text even
// though the link itself has nothing to jump to.
export function duplicateRowId(applicationId: string): string {
  return `migration-app-${applicationId}`;
}

const PILL_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300";

function matchTitle(match: DuplicateMatch): string {
  const reasons = match.reasons.map((r) => REASON_LABEL[r]).join(" & ");
  return `${match.playerName} (${match.status}) — ${reasons}`;
}

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

  // Single match: the whole pill is one link to that application's row.
  if (matches.length === 1) {
    const match = matches[0];
    return (
      <a
        href={`#${duplicateRowId(match.applicationId)}`}
        title={matchTitle(match)}
        className={`ml-2 ${PILL_CLASS} hover:bg-amber-100 dark:hover:bg-amber-900/50`}
      >
        ⚠ {label}
      </a>
    );
  }

  // Multiple matches: the pill itself is just a label (no single target to
  // link to), followed by one small numbered link per match.
  const title = matches.map(matchTitle).join("; ");
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1">
      <span title={title} className={PILL_CLASS}>
        ⚠ {label}
      </span>
      {matches.map((match, i) => (
        <a
          key={match.applicationId}
          href={`#${duplicateRowId(match.applicationId)}`}
          title={matchTitle(match)}
          className="text-[10px] font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
        >
          #{i + 1}
        </a>
      ))}
    </span>
  );
}
