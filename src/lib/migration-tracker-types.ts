// Pure types/constants split out of migration-tracker.ts specifically so
// client components can import Tier/TIER_ORDER without pulling in that
// file's `@/db` import — better-sqlite3 requires Node's `fs` and crashes
// the browser bundle if any client component transitively imports it.
// migration-tracker.ts re-exports these so every existing server-side
// import of Tier/TIER_ORDER from "@/lib/migration-tracker" keeps working.
export type Tier = "ultra_high" | "high" | "mid" | "low";
export type Classification = "high" | "mid" | "low";

// Highest to lowest — the display order used throughout the tracker UI.
export const TIER_ORDER: Tier[] = ["ultra_high", "high", "mid", "low"];
