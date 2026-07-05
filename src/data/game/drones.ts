import type { DroneTier } from './types'

// confirmedStats: verified final stat values from in-game Attribute Details screenshots.
// formationToFlagshipPct: the fixed % bonus one deployed drone adds to the flagship's
// Champions bucket.  Appears regardless of drone count (≥1 drone = bonus active).
// Confirmed from flagship detail screens:
//   ATK Champions gap = +4% when drones deployed
//   INT Champions gap = +5% when drones deployed
//   DEF = 0%  (the DEF gap in flagship Champions is WoH DEF, not drone formation)

export const DRONE_TIERS: DroneTier[] = [
  {
    id: 'kinetic-t7',
    name: 'Kinetic T7',
    element: 'kinetic',
    confirmedStats: { hp: 785_298, atk: 27_251, int: 24_704, def: 26_392 },
    formationToFlagshipPct: { atk: 4, int: 5, def: 0 },
  },
  // T6 through T1 to be added as screenshots are provided
]

export const DRONE_MAP = Object.fromEntries(
  DRONE_TIERS.map((d) => [d.id, d])
) as Record<string, DroneTier>
