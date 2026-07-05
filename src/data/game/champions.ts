import type { Champion } from './types'

// Formation % bonuses and passive notes per champion.
// formationConfirmed: true = verified from in-game Attribute Details screenshots.
// passivePct applies only when champion.element === flagship.element.

export const CHAMPIONS: Champion[] = [
  // ── Kinetic champions (confirmed formation data) ──────────────────────────

  {
    id: 'eva-von-trier',
    name: 'Eva von Trier',
    element: 'kinetic',
    cp: 160,
    damagebonus: 6,
    damagereduction: 6,
    formationPct: { atk: 38.61, def: 41.75, int: 48.88 },
    passivePct: { atk: 0, def: 0, int: 30.00 },  // Focus! (awakened): +30% INT to Kinetic flagships/craft
    formationConfirmed: true,
    ability: {
      name: 'Tough Love',
      isReactive: false,
      intMultiplierPerActivation: 12.60,  // 6 rockets × Formation INT × 210%
      grantsKineticOverload: true,
      kineticOverloadTriggers: 17,         // awakened: +10% Single Damage to Kinetic abilities, 17 triggers
    },
    woh: {
      honorLevel: 41,
      tierThreshold: 40,
      spaceAttr: { stat: 'int', pct: 2.0 },
      hpPctPerLevel: 0.02,
    },
  },

  {
    id: 'killer-bee',
    name: 'Killer Bee',
    element: 'kinetic',
    cp: 160,
    damagebonus: 4.8,
    damagereduction: 4.8,
    formationPct: { atk: 41.21, def: 50.81, int: 47.89 },
    // Hive Will (awakened): +16.56% INT and +16.56% DEF to Kinetic flagships/craft
    passivePct: { atk: 0, def: 16.56, int: 16.56 },
    formationConfirmed: true,
    ability: {
      name: 'Corrosive Swarm',
      isReactive: true,
      intMultiplierPerTrigger: 0.736,    // 73.6% per trigger
      maxTriggersPerWindow: 25,           // cap per 4.5s window (30 with awakening, not yet unlocked)
    },
    woh: null,  // KB WoH not yet activated (character not maxed)
  },

  {
    id: 'zora-domini',
    name: 'Zora Domini',
    element: 'kinetic',
    cp: 160,
    damagebonus: 6,
    damagereduction: 6,
    formationPct: { atk: 67.09, def: 56.22, int: 83.69 },
    // Mighty Grip (awakened): +30% INT to Kinetic flagships/craft
    passivePct: { atk: 0, def: 0, int: 30.00 },
    formationConfirmed: true,
    ability: {
      name: 'Unyielding Decree',
      isReactive: false,
      // 11 missiles (awakened) × INT × 300% × Vengeful Gaze 130% = INT × 42.90
      // × Kinetic Overload 110% (Eva fires before Zora in same cycle) = INT × 47.19
      intMultiplierPerActivation: 47.19,
    },
    signatureWeaponIntMultiplier: 13.86,  // Formation INT × 1386% per active ability use
    woh: {
      honorLevel: 60,
      tierThreshold: 60,
      spaceAttr: { stat: 'int', pct: 3.0 },
      hpPctPerLevel: 0.02,
    },
  },

  // ── Kinetic champions (WoH data only, formation stats unknown) ─────────────

  {
    id: 'unknown-h69',
    name: 'Unknown (Kinetic, H69)',
    element: 'kinetic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: {
      honorLevel: 69,
      tierThreshold: 60,
      spaceAttr: { stat: 'def', pct: 3.0 },
      hpPctPerLevel: 0.02,
    },
  },

  {
    id: 'riian-dessos',
    name: 'Riian Dessos',
    element: 'kinetic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: {
      honorLevel: 78,
      tierThreshold: 60,
      spaceAttr: { stat: 'atk', pct: 1.5 },
      hpPctPerLevel: 0.01,
    },
  },

  {
    id: 'lani-verita',
    name: 'Lani Verita',
    element: 'kinetic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: {
      honorLevel: 104,
      tierThreshold: 100,
      spaceAttr: { stat: 'atk', pct: 2.5 },
      hpPctPerLevel: 0.01,
    },
  },

  // ── Beam champions ────────────────────────────────────────────────────────

  {
    id: 'aliya',
    name: 'Aliya',
    element: 'beam',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 32, tierThreshold: 30, spaceAttr: { stat: 'int', pct: 1.0 }, hpPctPerLevel: 0 },
  },

  {
    id: 'doug-rockwell',
    name: 'Doug Rockwell',
    element: 'beam',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 63, tierThreshold: 60, spaceAttr: { stat: 'def', pct: 3.0 }, hpPctPerLevel: 0 },
  },

  {
    id: 'lucius-pullo',
    name: 'Lucius Pullo',
    element: 'beam',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 94, tierThreshold: 90, spaceAttr: { stat: 'atk', pct: 2.0 }, hpPctPerLevel: 0 },
  },

  {
    id: 'klara',
    name: 'Klara',
    element: 'beam',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 105, tierThreshold: 100, spaceAttr: { stat: 'int', pct: 2.5 }, hpPctPerLevel: 0 },
  },

  // ── Ionic champions ───────────────────────────────────────────────────────

  {
    id: 'jodie-beart',
    name: 'Jodie Béart',
    element: 'ionic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 26, tierThreshold: 20, spaceAttr: { stat: 'atk', pct: 1.0 }, hpPctPerLevel: 0 },
  },

  {
    id: 'ajita',
    name: 'Ajita',
    element: 'ionic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 7, tierThreshold: 5, spaceAttr: { stat: 'def', pct: 1.0 }, hpPctPerLevel: 0 },
  },

  {
    id: 'kama-moai',
    name: 'Kama Moai',
    element: 'ionic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 116, tierThreshold: 110, spaceAttr: { stat: 'int', pct: 2.5 }, hpPctPerLevel: 0 },
  },

  {
    id: 'phade',
    name: 'Phade',
    element: 'ionic',
    cp: 0,
    damagebonus: 0,
    damagereduction: 0,
    formationPct: { atk: 0, def: 0, int: 0 },
    passivePct: { atk: 0, def: 0, int: 0 },
    formationConfirmed: false,
    ability: null,
    woh: { honorLevel: 59, tierThreshold: 50, spaceAttr: { stat: 'int', pct: 1.0 }, hpPctPerLevel: 0 },
  },
]

export const CHAMPION_MAP = Object.fromEntries(
  CHAMPIONS.map((c) => [c.id, c])
) as Record<string, Champion>

export const CHAMPIONS_BY_ELEMENT = {
  kinetic: CHAMPIONS.filter((c) => c.element === 'kinetic'),
  beam: CHAMPIONS.filter((c) => c.element === 'beam'),
  ionic: CHAMPIONS.filter((c) => c.element === 'ionic'),
}
