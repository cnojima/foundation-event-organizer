import type { Flagship } from './types'

// Flat base values are from our photographed Gram configuration:
//   Level 28, +9 enhancement, Atlas MK2 Mythic 5-piece components (Lv 60)
// Technology % from research (130.80% ATK/INT/DEF — identical across stats in our tree)
// Component set bonus from 5-piece Atlas MK2 Kinetic Legendary: +20% ATK/DEF/INT

export const FLAGSHIPS: Flagship[] = [
  {
    id: 'gram',
    name: 'Gram',
    element: 'kinetic',
    flatBase: {
      hp:  313_837,  // Level 70,569 + Promotion 90,000 + Components 153,268
      atk:  20_401,  // Level 4,232 + Promotion 5,400 + Components 9,569 + Construction 1,200
      int:  20_076,  // Level 4,232 + Promotion 5,400 + Components 9,244 + Construction 1,200
      def:  19_926,  // Level 4,232 + Promotion 5,400 + Components 9,094 + Construction 1,200
    },
    technologyPct: { hp: 77.20, atk: 130.80, int: 130.80, def: 130.80 },
    componentSetPct: { atk: 20, int: 20, def: 20 },
    fixedCp: 109,  // Components 65 + Technology 29 + Events 15
  },
  // TODO: add the other two flagships when screenshots are available
]

export const FLAGSHIP_MAP = Object.fromEntries(
  FLAGSHIPS.map((f) => [f.id, f])
) as Record<string, Flagship>
