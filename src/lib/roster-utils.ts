import type { signups, users } from "@/db/schema";

export type SquadSignupRow = {
  signup: typeof signups.$inferSelect;
  user: typeof users.$inferSelect | null;
};

const WAITLIST_ROLE = "waitlist";

export function bucketSquad(s: SquadSignupRow): 1 | 2 | "waitlist" | null {
  if (s.signup.assignedRole === WAITLIST_ROLE) return "waitlist";
  if (s.signup.assignedSquad === 1 || s.signup.assignedSquad === 2) {
    return s.signup.assignedSquad as 1 | 2;
  }
  if (s.signup.squad1Preference === 1) return 1;
  if (s.signup.squad2Preference === 1) return 2;
  return null;
}

function roleSortKey(role: string | null): number {
  if (role === "leader") return 0;
  if (role === "backup") return 2;
  return 1;
}

export function sortRoster(rows: SquadSignupRow[]): SquadSignupRow[] {
  return [...rows].sort((a, b) => {
    const ra = roleSortKey(a.signup.assignedRole);
    const rb = roleSortKey(b.signup.assignedRole);
    if (ra !== rb) return ra - rb;
    return a.signup.createdAt.localeCompare(b.signup.createdAt);
  });
}
