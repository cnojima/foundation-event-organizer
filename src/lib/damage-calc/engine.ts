import type { FleetConfig, ComputedFleetStats } from '@/data/game/types'
import { CHAMPION_MAP, CHAMPIONS } from '@/data/game/champions'
import { FLAGSHIP_MAP } from '@/data/game/flagships'
import { NEXUS_MAP } from '@/data/game/nexus'
import { DRONE_MAP } from '@/data/game/drones'

// CP damage bonus formula (4 data points confirmed): ±14 × |diff|^0.16
export function cpBonusPct(myCp: number, enemyCp: number): number {
  const diff = myCp - enemyCp
  if (diff === 0) return 0
  const abs = Math.abs(diff)
  return Math.sign(diff) * 14 * Math.pow(abs, 0.16)
}

// Activation schedule: first at t=5s, every 10s thereafter
export function activationTimes(battleDurationSeconds: number): number[] {
  const times: number[] = []
  for (let t = 5; t < battleDurationSeconds; t += 10) times.push(t)
  return times
}

export function computeFleetStats(config: FleetConfig): ComputedFleetStats {
  const flagship = FLAGSHIP_MAP[config.flagshipId]
  if (!flagship) throw new Error(`Unknown flagship: ${config.flagshipId}`)

  const nexus = config.nexusId ? NEXUS_MAP[config.nexusId] ?? null : null
  const drone = config.droneId ? DRONE_MAP[config.droneId] ?? null : null
  const hasDrones = drone != null && config.droneCount > 0

  const champions = config.championSlots.map((id) =>
    id ? (CHAMPION_MAP[id] ?? null) : null
  )
  const activeChampions = champions.filter(Boolean)

  // Resonance: all 3 slots filled with same-element champions as the flagship
  const resonanceActive =
    activeChampions.length === 3 &&
    activeChampions.every((c) => c!.element === flagship.element)

  // ── Champions bucket ────────────────────────────────────────────────────
  const champsBucket = { hp: 0, atk: 0, def: 0, int: 0 }

  // Formation page % and passive % — only champions in the active formation
  for (const champ of activeChampions) {
    if (!champ) continue
    champsBucket.atk += champ.formationPct.atk
    champsBucket.def += champ.formationPct.def
    champsBucket.int += champ.formationPct.int

    // Passive bonuses only apply when elements match
    if (champ.element === flagship.element) {
      champsBucket.atk += champ.passivePct.atk
      champsBucket.def += champ.passivePct.def
      champsBucket.int += champ.passivePct.int
    }
  }

  // WoH bonuses — from ALL champions of matching element (global: applies to ships
  // of matching style regardless of formation slot). HP scales continuously with
  // honor level; space attr (ATK/DEF/INT) unlocks at tierThreshold.
  for (const champ of CHAMPIONS) {
    if (!champ.woh || champ.element !== flagship.element) continue
    const honorLevel = config.wohHonorLevels[champ.id] ?? champ.woh.honorLevel
    champsBucket.hp += honorLevel * champ.woh.hpPctPerLevel
    if (champ.woh.spaceAttr && honorLevel >= champ.woh.tierThreshold) {
      champsBucket[champ.woh.spaceAttr.stat] += champ.woh.spaceAttr.pct
    }
  }

  // Drone formation bonuses to flagship (fixed, active as long as ≥1 drone deployed)
  if (hasDrones) {
    champsBucket.atk += drone!.formationToFlagshipPct.atk
    champsBucket.def += drone!.formationToFlagshipPct.def
    champsBucket.int += drone!.formationToFlagshipPct.int
  }

  // ── Per-stat computation ─────────────────────────────────────────────────
  const techPct = flagship.technologyPct
  const compPct = flagship.componentSetPct
  const resonancePct = resonanceActive ? 20 : 0
  const crewPct = nexus?.crewPct ?? { hp: 0, atk: 0, int: 0, def: 0 }

  const totalPct = (stat: 'hp' | 'atk' | 'int' | 'def'): number => {
    const compBonus = stat === 'hp' ? 0 : (compPct[stat as 'atk' | 'int' | 'def'] ?? 0)
    const resBonus = stat === 'hp' ? 0 : resonancePct
    const atkBonus = stat === 'atk' ? config.appearancePct.atk + config.portPct.atk : 0
    const intBonus = stat === 'int' ? config.portPct.int : 0
    const defBonus = stat === 'def' ? config.appearancePct.def + config.portPct.def : 0
    return (
      techPct[stat] +
      compBonus +
      champsBucket[stat] +
      resBonus +
      crewPct[stat] +
      atkBonus +
      intBonus +
      defBonus
    )
  }

  const flagship_ = {
    hp:  Math.round(flagship.flatBase.hp  * (1 + totalPct('hp')  / 100)),
    atk: Math.round(flagship.flatBase.atk * (1 + totalPct('atk') / 100)),
    int: Math.round(flagship.flatBase.int * (1 + totalPct('int') / 100)),
    def: Math.round(flagship.flatBase.def * (1 + totalPct('def') / 100)),
  }

  const droneStats = drone ? { ...drone.confirmedStats } : null
  const fleetHp = flagship_.hp + (hasDrones ? drone!.confirmedStats.hp * config.droneCount : 0)

  // ── CP ──────────────────────────────────────────────────────────────────
  const championCp = activeChampions.reduce((s, c) => s + (c?.cp ?? 0), 0)
  const totalCp = config.fixedCp + championCp
  const bonusPct = cpBonusPct(totalCp, config.enemyCp)

  // ── Ability damage schedule ──────────────────────────────────────────────
  const abilityDamage: ComputedFleetStats['abilityDamage'] = {
    perCycleByChampion: [],
    signatureWeapon: null,
  }

  for (const champ of activeChampions) {
    if (!champ?.ability) continue
    if (champ.ability.isReactive) {
      // KB-type: show max per saturation window (25 triggers × 73.6%)
      const windowMult =
        (champ.ability.maxTriggersPerWindow ?? 0) *
        (champ.ability.intMultiplierPerTrigger ?? 0)
      abilityDamage.perCycleByChampion.push({
        championId: champ.id,
        name: champ.ability.name,
        label: `${champ.ability.maxTriggersPerWindow} triggers × ${((champ.ability.intMultiplierPerTrigger ?? 0) * 100).toFixed(1)}%`,
        rawMultiplier: windowMult,
        isReactive: true,
      })
    } else {
      abilityDamage.perCycleByChampion.push({
        championId: champ.id,
        name: champ.ability.name,
        label: `INT × ${(champ.ability.intMultiplierPerActivation ?? 0).toFixed(2)}`,
        rawMultiplier: champ.ability.intMultiplierPerActivation ?? 0,
        isReactive: false,
      })
    }

    if (champ.signatureWeaponIntMultiplier) {
      abilityDamage.signatureWeapon = {
        championId: champ.id,
        name: `${champ.name} Signature`,
        rawMultiplier: champ.signatureWeaponIntMultiplier,
      }
    }
  }

  return {
    flagship: flagship_,
    droneStats,
    fleetHp,
    formationInt: flagship_.int,
    totalCp,
    resonanceActive,
    champsBucket,
    cpBonusPct: bonusPct,
    buckets: {
      technology: techPct,
      components: { atk: compPct.atk, int: compPct.int, def: compPct.def },
      champions: champsBucket,
      resonance: { atk: resonancePct, int: resonancePct, def: resonancePct },
      crew: crewPct,
      appearance: config.appearancePct,
      port: config.portPct,
    },
    abilityDamage,
  }
}
