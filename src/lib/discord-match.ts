import type { DiscordGuildMember } from "@/bot/discord-bot";

// Fuzzy-match an in-game name against a list of Discord server members.
// Used by the onboarding-import flow to pre-fill `users.discord_user_id`
// on newly created stub members — once that field is set, the existing
// auto-claim flow in src/auth.ts merges the stub on the first Discord
// sign-in.
//
// Match priorities, in order:
//   1. Exact (normalized) match against username / globalName / nick.
//   2. Substring containment (either direction, both ≥3 chars normalized)
//      against the same fields.
//   3. Levenshtein edit distance ≤ 2 for short names (≤8 chars), ≤ 3 for
//      longer names — captures one-or-two-typo OCR/transliteration drift.
//
// "Liberal" mode (per the design decision) collapses 1–3 into a single
// auto-fill-on-best-match bucket. Conservative mode would auto-fill only on
// match level 1 and require admin click-through for 2 and 3 — kept here
// as an option for a future toggle.

export type MatchConfidence = "exact" | "fuzzy" | "none";

export type DiscordMatch = {
  member: DiscordGuildMember;
  confidence: Exclude<MatchConfidence, "none">;
  // The specific field that produced the match — surfaced in the UI so
  // admins can sanity-check ambiguous hits ("did it match my username or
  // my server nickname?").
  matchedOn: "username" | "globalName" | "nick";
  // Lower is better. 0 for exact matches.
  distance: number;
};

// Normalize for comparison: NFC, lowercase, strip everything that isn't a
// letter or digit (Unicode-aware). Folds "[LAW] Coragane", "Coragane.", and
// "coragane" together. Diacritics are preserved by NFC — folks who use
// "Mörd" in-game shouldn't collide with "Mord".
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// Capped Levenshtein. Returns +Infinity if the optimal edit distance
// exceeds `maxDistance` — avoids quadratic blow-up on long mismatched
// names. The cap is a strict upper bound, not an early exit on the best
// path, so callers get exact distances inside the window.
export function levenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return Infinity;

  // Standard DP, row-by-row to save memory.
  let prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    // If the whole row is already past the cap, the answer can only grow.
    if (rowMin > maxDistance) return Infinity;
    prev = cur;
  }
  return prev[b.length] > maxDistance ? Infinity : prev[b.length];
}

// Match strictness threshold (substring): require both halves to be ≥3
// normalized chars to avoid pathological hits like "ka" matching
// "katarina_strong_lol_xx".
const MIN_SUBSTRING = 3;

function distanceCapFor(len: number): number {
  return len <= 8 ? 2 : 3;
}

// Try every Discord-side identity field for one member. Returns the best
// hit found, or null. Tie-breaks favor (a) the more specific field
// (nickname > globalName > username) and (b) lower distance.
function matchOneMember(
  normalizedTarget: string,
  member: DiscordGuildMember
): DiscordMatch | null {
  const candidates: { value: string; field: DiscordMatch["matchedOn"] }[] = [
    { value: member.nick ?? "", field: "nick" },
    { value: member.globalName ?? "", field: "globalName" },
    { value: member.username, field: "username" },
  ];

  let best: DiscordMatch | null = null;
  for (const c of candidates) {
    const candidate = normalize(c.value);
    if (!candidate) continue;
    if (candidate === normalizedTarget) {
      return { member, confidence: "exact", matchedOn: c.field, distance: 0 };
    }
    // Substring containment counts as fuzzy at distance = lengthDelta.
    if (
      candidate.length >= MIN_SUBSTRING &&
      normalizedTarget.length >= MIN_SUBSTRING &&
      (candidate.includes(normalizedTarget) ||
        normalizedTarget.includes(candidate))
    ) {
      const delta = Math.abs(candidate.length - normalizedTarget.length);
      if (!best || delta < best.distance) {
        best = {
          member,
          confidence: "fuzzy",
          matchedOn: c.field,
          distance: delta,
        };
      }
      continue;
    }
    const cap = Math.min(
      distanceCapFor(candidate.length),
      distanceCapFor(normalizedTarget.length)
    );
    const d = levenshtein(candidate, normalizedTarget, cap);
    if (d !== Infinity && d <= cap) {
      if (!best || d < best.distance) {
        best = {
          member,
          confidence: "fuzzy",
          matchedOn: c.field,
          distance: d,
        };
      }
    }
  }
  return best;
}

// Pick the best Discord match across the entire server for one in-game
// name. Returns null if nothing crosses the fuzzy threshold.
export function findBestMatch(
  inGameName: string,
  members: DiscordGuildMember[]
): DiscordMatch | null {
  const target = normalize(inGameName);
  if (target.length < 2) return null;

  let best: DiscordMatch | null = null;
  for (const member of members) {
    const hit = matchOneMember(target, member);
    if (!hit) continue;
    if (hit.confidence === "exact") return hit; // can't beat this
    if (!best || hit.distance < best.distance) {
      best = hit;
    }
  }
  return best;
}
