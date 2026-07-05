import type { Nexus } from './types'

// crewPct = Heroic Crew bonuses + Nexus Attribute bonuses (combined per stat line in game UI)
// Kinetic Echo Hub (Stage 10) with Salvor/Gaal/Raych/Zephyr crew:
//   HP:  Heroic 36% + Nexus 21%         = 57.00%
//   ATK: Heroic 75% + Nexus 28%         = 103.00%
//   INT: Heroic 60% + Nexus 29%         = 89.00%
//   DEF: Heroic 75% + Nexus 28.5%       = 103.50%

export const NEXUS_LIST: Nexus[] = [
  {
    id: 'kinetic-echo-hub',
    name: 'Kinetic Echo Hub',
    element: 'kinetic',
    crewPct: { hp: 57, atk: 103, int: 89, def: 103.5 },
  },
  // TODO: add Beam and Ionic nexus when screenshots are available
]

export const NEXUS_MAP = Object.fromEntries(
  NEXUS_LIST.map((n) => [n.id, n])
) as Record<string, Nexus>
