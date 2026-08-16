// Shared read-only display for a game UID cell — used by both the admin
// closed-window roster and the public roster tables. Highlights missing
// UIDs (legacy applications predating the required-UID change, or admin
// corrections that cleared it) so officers can spot and chase them down.
//
// `hideValue` (public rosters) suppresses the actual UID — a present UID
// renders nothing, so the column only ever surfaces the "missing" signal,
// never the value itself.
export function GameUidCell({
  gameUid,
  missingLabel,
  hideValue = false,
}: {
  gameUid: string | null;
  missingLabel: string;
  hideValue?: boolean;
}) {
  if (!gameUid) {
    return (
      <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
        {missingLabel}
      </span>
    );
  }
  if (hideValue) return null;
  return <>{gameUid}</>;
}
