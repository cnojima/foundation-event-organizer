export type Element = 'kinetic' | 'beam' | 'ionic'

export interface Champion {
  id: string
  name: string
  element: Element
  cp: number
  damagebonus: number
  damagereduction: number
  // % bonuses added to flagship's Champions stat bucket from champion page
  formationPct: { atk: number; def: number; int: number }
  // Passive % bonuses — only applied when champion.element === flagship.element
  passivePct: { atk: number; def: number; int: number }
  // true when we have confirmed screenshot data for this champion's formation stats
  formationConfirmed: boolean
  ability: {
    name: string
    isReactive: boolean
    // For normal abilities: INT multiplier for one activation (already accounts for missile count,
    // awakening multipliers, and Kinetic Overload buff where applicable)
    intMultiplierPerActivation?: number
    // For reactive abilities (KB): per-trigger and window cap
    intMultiplierPerTrigger?: number
    maxTriggersPerWindow?: number
    // Does this ability grant Kinetic Overload to the next ability in the cycle?
    grantsKineticOverload?: boolean
    kineticOverloadTriggers?: number
  } | null
  // Signature weapon: extra ability damage per activation
  signatureWeaponIntMultiplier?: number
  woh: {
    // Current honor level (from user's game — seed from screenshots)
    honorLevel: number
    // Honor level at which the space attribute tier unlocks
    tierThreshold: number
    // Space attribute bonus for ships of matching element
    spaceAttr: { stat: 'atk' | 'def' | 'int'; pct: number } | null
    // HP bonus: honorLevel × hpPctPerLevel (cumulative, always active)
    hpPctPerLevel: number
  } | null
}

export interface Flagship {
  id: string
  name: string
  element: Element
  // Flat base at a known configuration (our photographed preset)
  flatBase: { hp: number; atk: number; int: number; def: number }
  // Technology % from research (identical across ATK/INT/DEF in our data)
  technologyPct: { hp: number; atk: number; int: number; def: number }
  // Component set bonus % (e.g. Atlas MK2 Mythic 5-piece kinetic)
  componentSetPct: { atk: number; int: number; def: number }
  // CP from non-champion sources (components + technology + events, fixed for preset)
  fixedCp: number
}

export interface Nexus {
  id: string
  name: string
  element: Element
  // Combined Formation + Nexus Attribute crew bonuses (already summed)
  crewPct: { hp: number; atk: number; int: number; def: number }
}

export interface DroneTier {
  id: string
  name: string
  element: Element
  // Confirmed final stats (from our screenshots — used as preset values)
  confirmedStats: { hp: number; atk: number; int: number; def: number }
  // % bonus this drone type gives to flagship's Champions bucket (appears there, not on drone's page)
  formationToFlagshipPct: { atk: number; int: number; def: number }
}

export interface FleetConfig {
  flagshipId: string
  // Champion IDs for each slot (null = empty)
  championSlots: (string | null)[]
  nexusId: string | null
  droneId: string | null
  droneCount: number
  // User-adjustable bonus overrides
  portPct: { atk: number; int: number; def: number }
  appearancePct: { atk: number; def: number }
  // Honor levels per champion (defaults from screenshots; user can update)
  wohHonorLevels: Record<string, number>
  // Fixed CP from non-champion sources (components + tech + events)
  fixedCp: number
  // Enemy CP (for damage bonus calculation)
  enemyCp: number
}

export interface BonusBuckets {
  technology: { hp: number; atk: number; int: number; def: number }
  components: { atk: number; int: number; def: number }
  champions: { hp: number; atk: number; int: number; def: number }
  resonance: { atk: number; int: number; def: number }
  crew: { hp: number; atk: number; int: number; def: number }
  appearance: { atk: number; def: number }
  port: { atk: number; int: number; def: number }
}

export interface ComputedFleetStats {
  flagship: { hp: number; atk: number; int: number; def: number }
  droneStats: { hp: number; atk: number; int: number; def: number } | null
  fleetHp: number
  formationInt: number
  totalCp: number
  resonanceActive: boolean
  champsBucket: { hp: number; atk: number; int: number; def: number }
  buckets: BonusBuckets
  cpBonusPct: number  // positive = advantage, negative = disadvantage
  abilityDamage: {
    perCycleByChampion: Array<{
      championId: string
      name: string
      label: string
      rawMultiplier: number  // Formation INT × this = theoretical damage before enemy reduction
      isReactive: boolean
    }>
    signatureWeapon: { championId: string; name: string; rawMultiplier: number } | null
  }
}
