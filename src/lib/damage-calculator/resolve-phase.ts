import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { damageReadings } from "@/db/schema";
import { subPhasesForDigit, type Phase, type StageDigit } from "@/lib/damage-calculator/phases";

// Screenshots are uploaded flat (no phase-labeled folder), so the only
// signal for which of a major stage's 3 sub-phases a screenshot belongs to
// is the order screenshots arrive in: within one sub-phase, each fleet
// appears once, then the next sub-phase starts and fleets repeat. So a
// fleet re-appearing within a major stage's already-recorded readings means
// upload has moved on to the next sub-phase.
export async function resolveFlatPhase(params: {
  sessionId: string;
  digit: StageDigit;
  fleetId: string;
}): Promise<Phase> {
  const subPhases = subPhasesForDigit(params.digit);
  if (subPhases.length === 1) return subPhases[0];

  const existing = await db
    .select({ phase: damageReadings.phase, fleetId: damageReadings.fleetId })
    .from(damageReadings)
    .where(
      and(
        eq(damageReadings.sessionId, params.sessionId),
        inArray(damageReadings.phase, subPhases)
      )
    );

  if (existing.length === 0) return subPhases[0];

  let currentIndex = 0;
  for (const row of existing) {
    const idx = subPhases.indexOf(row.phase as Phase);
    if (idx > currentIndex) currentIndex = idx;
  }
  const currentPhase = subPhases[currentIndex];
  const fleetAlreadyInCurrent = existing.some(
    (r) => r.phase === currentPhase && r.fleetId === params.fleetId
  );
  if (fleetAlreadyInCurrent && currentIndex < subPhases.length - 1) {
    return subPhases[currentIndex + 1];
  }
  return currentPhase;
}
