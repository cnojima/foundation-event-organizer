// Pure, framework-agnostic duplicate detection for migration applications —
// no DB access, so it's safe to call from a server component with an
// already-fetched list. Two rules, applied independently (a pair can match
// on both — in which case it's still a single match with both reasons
// attached, not two separate entries):
//
// 1. Same normalized Game UID — treated as the same account, regardless of
//    name/server (a UID is meant to be a unique per-account identifier).
// 2. Same normalized playerName AND same normalized sourceServer — a name
//    match alone isn't enough (common names recur across servers), but
//    name + server together is a strong signal of the same person
//    re-applying.
//
// "Normalized" strips everything but letters/digits and lowercases, so
// "Cur-isu ", "cur isu", and "CurIsu" all collapse to the same key —
// exact match after normalization, no fuzzy/edit-distance matching.
//
// Withdrawn and admin-removed applications are excluded from comparison
// entirely (both as flaggable applications and as match targets) — once an
// application is gone, it shouldn't keep triggering a "possible duplicate"
// badge on whatever it used to match, and it shouldn't show one itself.
// Denied/accepted stay in scope: those are still-live records of someone
// having applied under that identity.

const EXCLUDED_STATUSES = new Set(["withdrawn", "removed_by_admin"]);

export type DuplicateReason = "gameUid" | "nameAndServer";

export type DuplicateMatch = {
  applicationId: string;
  playerName: string;
  status: string;
  reasons: DuplicateReason[];
};

export type MinimalApplication = {
  id: string;
  playerName: string;
  sourceServer: string;
  gameUid: string | null;
  status: string;
};

export function normalizeForDedupe(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    let group = groups.get(k);
    if (!group) {
      group = [];
      groups.set(k, group);
    }
    group.push(item);
  }
  return groups;
}

// Merges into `result` by target applicationId — a pair that matches on
// multiple rules (e.g. same UID *and* same name+server) ends up as one
// match with both reasons attached, rather than two separate entries
// pointing at the same target.
function addAllPairs<T extends MinimalApplication>(
  result: Map<string, DuplicateMatch[]>,
  groups: Map<string, T[]>,
  reason: DuplicateReason
): void {
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const a of group) {
      for (const b of group) {
        if (a.id === b.id) continue;
        let matches = result.get(a.id);
        if (!matches) {
          matches = [];
          result.set(a.id, matches);
        }
        const existing = matches.find((m) => m.applicationId === b.id);
        if (existing) {
          if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        } else {
          matches.push({ applicationId: b.id, playerName: b.playerName, status: b.status, reasons: [reason] });
        }
      }
    }
  }
}

// Returns a map of applicationId -> the other applications it looks like a
// duplicate of. Compares across the full array passed in — callers decide
// scope (e.g. all applications for one destination, any status).
export function findDuplicateMatches(
  applications: MinimalApplication[]
): Map<string, DuplicateMatch[]> {
  const result = new Map<string, DuplicateMatch[]>();
  const live = applications.filter((a) => !EXCLUDED_STATUSES.has(a.status));

  const byUid = groupBy(
    live.filter((a) => a.gameUid && a.gameUid.trim() !== ""),
    (a) => normalizeForDedupe(a.gameUid as string)
  );
  addAllPairs(result, byUid, "gameUid");

  const byNameAndServer = groupBy(
    live,
    (a) => `${normalizeForDedupe(a.playerName)}::${normalizeForDedupe(a.sourceServer)}`
  );
  addAllPairs(result, byNameAndServer, "nameAndServer");

  return result;
}
