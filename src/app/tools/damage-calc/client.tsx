'use client'

import { useState, useMemo, useCallback } from 'react'
import { CHAMPIONS, CHAMPIONS_BY_ELEMENT } from '@/data/game/champions'
import { FLAGSHIPS } from '@/data/game/flagships'
import { NEXUS_LIST } from '@/data/game/nexus'
import { DRONE_TIERS } from '@/data/game/drones'
import { computeFleetStats } from '@/lib/damage-calc/engine'
import type { FleetConfig, ComputedFleetStats } from '@/data/game/types'

const DEFAULT_WOH_HONOR_LEVELS: Record<string, number> = {
  'eva-von-trier':  41,
  'zora-domini':    60,
  'unknown-h69':    69,
  'riian-dessos':   78,
  'lani-verita':   104,
  'aliya':          32,
  'doug-rockwell':  63,
  'lucius-pullo':   94,
  'klara':         105,
  'jodie-beart':    26,
  'ajita':           7,
  'kama-moai':     116,
  'phade':          59,
}

const DEFAULT_CONFIG: FleetConfig = {
  flagshipId: 'gram',
  championSlots: ['eva-von-trier', 'killer-bee', 'zora-domini'],
  nexusId: 'kinetic-echo-hub',
  droneId: 'kinetic-t7',
  droneCount: 10,
  portPct: { atk: 14, int: 15, def: 25 },
  appearancePct: { atk: 8, def: 1 },
  wohHonorLevels: DEFAULT_WOH_HONOR_LEVELS,
  fixedCp: 109,
  enemyCp: 413,
}

const ELEMENT_COLORS = {
  kinetic: 'text-amber-600 dark:text-amber-400',
  beam:    'text-blue-600 dark:text-blue-400',
  ionic:   'text-green-600 dark:text-green-400',
}

const ELEMENT_LABELS = { kinetic: 'Kinetic', beam: 'Beam', ionic: 'Ionic' }

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCell({ value, sub }: { value: number; sub?: string }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <div className="font-semibold">{fmt(value)}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </td>
  )
}

function BucketRow({ label, hp, atk, int: int_, def }: { label: string; hp?: number; atk?: number; int?: number; def?: number }) {
  const show = (v?: number) => v != null && v !== 0
  if (!show(hp) && !show(atk) && !show(int_) && !show(def)) return null
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800 text-xs">
      <td className="px-3 py-1 text-gray-500 dark:text-gray-400">{label}</td>
      <td className="px-3 py-1 text-right tabular-nums text-gray-600 dark:text-gray-300">{show(hp) ? pct(hp!) : '—'}</td>
      <td className="px-3 py-1 text-right tabular-nums text-gray-600 dark:text-gray-300">{show(atk) ? pct(atk!) : '—'}</td>
      <td className="px-3 py-1 text-right tabular-nums text-gray-600 dark:text-gray-300">{show(int_) ? pct(int_!) : '—'}</td>
      <td className="px-3 py-1 text-right tabular-nums text-gray-600 dark:text-gray-300">{show(def) ? pct(def!) : '—'}</td>
    </tr>
  )
}

function ChampionSlot({
  index,
  value,
  flagshipElement,
  onChange,
}: {
  index: number
  value: string | null
  flagshipElement: string
  onChange: (idx: number, id: string | null) => void
}) {
  const champ = value ? CHAMPIONS.find((c) => c.id === value) : null
  const unconfirmed = champ && !champ.formationConfirmed

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        Champion {index + 1}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(index, e.target.value || null)}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">— Empty slot —</option>
        {(['kinetic', 'beam', 'ionic'] as const).map((el) => (
          <optgroup key={el} label={ELEMENT_LABELS[el]}>
            {CHAMPIONS_BY_ELEMENT[el].map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{!c.formationConfirmed ? ' ⚠' : ''}{c.element !== flagshipElement ? ' ↕' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {unconfirmed && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠ Formation stats not yet photographed — contribution shows as 0
        </p>
      )}
      {champ && champ.element !== flagshipElement && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          ↕ Different element — passive bonuses will NOT apply to flagship
        </p>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function DamageCalcClient() {
  const [config, setConfig] = useState<FleetConfig>(DEFAULT_CONFIG)
  const [showBuckets, setShowBuckets] = useState(false)
  const [showWoh, setShowWoh] = useState(false)

  const stats = useMemo<ComputedFleetStats | null>(() => {
    try {
      return computeFleetStats(config)
    } catch {
      return null
    }
  }, [config])

  const setChampion = useCallback((idx: number, id: string | null) => {
    setConfig((c) => {
      const slots = [...c.championSlots]
      slots[idx] = id
      return { ...c, championSlots: slots }
    })
  }, [])

  const flagship = FLAGSHIPS.find((f) => f.id === config.flagshipId)

  // Kinetic WoH champions (only relevant when flagship is kinetic)
  const wohChampions = CHAMPIONS.filter(
    (c) => c.woh && c.element === (flagship?.element ?? 'kinetic')
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Fleet Damage Calculator
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Foundation: Galactic Frontier — reverse-engineered stat model
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* ── Left: Configuration ── */}
        <div className="space-y-6">

          {/* Flagship */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Flagship</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ship</label>
              <select
                value={config.flagshipId}
                onChange={(e) => setConfig((c) => ({ ...c, flagshipId: e.target.value }))}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {FLAGSHIPS.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({ELEMENT_LABELS[f.element]})</option>
                ))}
              </select>
              {flagship && (
                <p className="mt-1 text-xs text-gray-400">
                  Preset: Level 28 +9 · Atlas MK2 Mythic 5-piece
                </p>
              )}
            </div>
          </section>

          {/* Champions */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Champions</h2>
            {[0, 1, 2].map((i) => (
              <ChampionSlot
                key={i}
                index={i}
                value={config.championSlots[i] ?? null}
                flagshipElement={flagship?.element ?? 'kinetic'}
                onChange={setChampion}
              />
            ))}
            {stats?.resonanceActive && (
              <div className="rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                Style Resonance active — +20% ATK/DEF/INT
              </div>
            )}
          </section>

          {/* Nexus & Drones */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Nexus & Drones</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nexus</label>
              <select
                value={config.nexusId ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, nexusId: e.target.value || null }))}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">— None —</option>
                {NEXUS_LIST.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({ELEMENT_LABELS[n.element]})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Drone Tier</label>
              <select
                value={config.droneId ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, droneId: e.target.value || null }))}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">— None —</option>
                {DRONE_TIERS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Drone Count: <span className="font-semibold text-gray-800 dark:text-gray-200">{config.droneCount}</span>
              </label>
              <input
                type="range" min={0} max={10}
                value={config.droneCount}
                onChange={(e) => setConfig((c) => ({ ...c, droneCount: +e.target.value }))}
                className="w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0</span><span>5</span><span>10</span>
              </div>
            </div>
          </section>

          {/* Bonuses */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Bonuses</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Appearance ATK %</label>
                <input
                  type="number" step="0.1"
                  value={config.appearancePct.atk}
                  onChange={(e) => setConfig((c) => ({ ...c, appearancePct: { ...c.appearancePct, atk: +e.target.value } }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Appearance DEF %</label>
                <input
                  type="number" step="0.1"
                  value={config.appearancePct.def}
                  onChange={(e) => setConfig((c) => ({ ...c, appearancePct: { ...c.appearancePct, def: +e.target.value } }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port ATK %</label>
                <input
                  type="number" step="0.1"
                  value={config.portPct.atk}
                  onChange={(e) => setConfig((c) => ({ ...c, portPct: { ...c.portPct, atk: +e.target.value } }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port INT %</label>
                <input
                  type="number" step="0.1"
                  value={config.portPct.int}
                  onChange={(e) => setConfig((c) => ({ ...c, portPct: { ...c.portPct, int: +e.target.value } }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port DEF %</label>
                <input
                  type="number" step="0.1"
                  value={config.portPct.def}
                  onChange={(e) => setConfig((c) => ({ ...c, portPct: { ...c.portPct, def: +e.target.value } }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Enemy CP</label>
                <input
                  type="number"
                  value={config.enemyCp}
                  onChange={(e) => setConfig((c) => ({ ...c, enemyCp: +e.target.value }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          </section>

          {/* WoH Honor Levels */}
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <button
              onClick={() => setShowWoh((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Wall of Honor Honor Levels
              <span className="text-gray-400">{showWoh ? '▲' : '▼'}</span>
            </button>
            {showWoh && (
              <div className="mt-3 space-y-2">
                {wohChampions.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <label className="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">
                      {c.name}
                      {c.woh?.spaceAttr && (
                        <span className="ml-1 text-gray-400">
                          ({c.woh.spaceAttr.stat.toUpperCase()} +{c.woh.spaceAttr.pct}% @ H{c.woh?.tierThreshold})
                        </span>
                      )}
                    </label>
                    <input
                      type="number" min={0}
                      value={config.wohHonorLevels[c.id] ?? c.woh?.honorLevel ?? 0}
                      onChange={(e) =>
                        setConfig((cfg) => ({
                          ...cfg,
                          wohHonorLevels: { ...cfg.wohHonorLevels, [c.id]: +e.target.value },
                        }))
                      }
                      className="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                ))}
                <p className="text-xs text-gray-400 pt-1">
                  WoH HP = Σ (honor level × per-level rate) for all {ELEMENT_LABELS[flagship?.element ?? 'kinetic']} champions
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ── Right: Results ── */}
        {stats && (
          <div className="space-y-6">

            {/* Flagship stats */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  Flagship Stats
                  {flagship && (
                    <span className={`ml-2 text-sm font-normal ${ELEMENT_COLORS[flagship.element]}`}>
                      {flagship.name} · {ELEMENT_LABELS[flagship.element]}
                    </span>
                  )}
                </h2>
                <button
                  onClick={() => setShowBuckets((v) => !v)}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {showBuckets ? 'Hide' : 'Show'} breakdown
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-28">Stat</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">HP</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">ATK</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">INT</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">DEF</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Flagship</td>
                      <StatCell value={stats.flagship.hp} />
                      <StatCell value={stats.flagship.atk} />
                      <StatCell value={stats.flagship.int} />
                      <StatCell value={stats.flagship.def} />
                    </tr>
                    {stats.droneStats && config.droneCount > 0 && (
                      <tr className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          Drone (×{config.droneCount})
                        </td>
                        <StatCell value={stats.droneStats.hp} sub={`×${config.droneCount} = ${fmt(stats.droneStats.hp * config.droneCount)}`} />
                        <StatCell value={stats.droneStats.atk} />
                        <StatCell value={stats.droneStats.int} />
                        <StatCell value={stats.droneStats.def} />
                      </tr>
                    )}
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/30">
                      <td className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Fleet HP</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100" colSpan={4}>
                        {fmt(stats.fleetHp)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {showBuckets && (
                  <table className="w-full text-sm border-t-2 border-gray-200 dark:border-gray-700">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-3 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-28">Bucket</th>
                        <th className="px-3 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">HP %</th>
                        <th className="px-3 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">ATK %</th>
                        <th className="px-3 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">INT %</th>
                        <th className="px-3 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400">DEF %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <BucketRow label="Technology" hp={stats.buckets.technology.hp} atk={stats.buckets.technology.atk} int={stats.buckets.technology.int} def={stats.buckets.technology.def} />
                      <BucketRow label="Components" atk={stats.buckets.components.atk} int={stats.buckets.components.int} def={stats.buckets.components.def} />
                      <BucketRow label="Champions" hp={stats.champsBucket.hp > 0 ? stats.champsBucket.hp : undefined} atk={stats.champsBucket.atk} int={stats.champsBucket.int} def={stats.champsBucket.def} />
                      <BucketRow label="Resonance" atk={stats.buckets.resonance.atk} int={stats.buckets.resonance.int} def={stats.buckets.resonance.def} />
                      <BucketRow label="Crew" hp={stats.buckets.crew.hp} atk={stats.buckets.crew.atk} int={stats.buckets.crew.int} def={stats.buckets.crew.def} />
                      <BucketRow label="Appearance" atk={stats.buckets.appearance.atk} def={stats.buckets.appearance.def} />
                      <BucketRow label="Port" atk={stats.buckets.port.atk} int={stats.buckets.port.int} def={stats.buckets.port.def} />
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* CP & Damage Modifier */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Combat Power</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmt(stats.totalCp)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Your CP</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmt(config.enemyCp)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Enemy CP</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${stats.cpBonusPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stats.cpBonusPct >= 0 ? '+' : ''}{stats.cpBonusPct.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Damage bonus</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Formula: ±14 × |CP diff|^0.16 — confirmed across 4 data points
              </p>
            </section>

            {/* Ability Schedule */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Ability Damage (per cycle)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Formation INT: <span className="font-semibold text-gray-700 dark:text-gray-300">{fmt(stats.formationInt)}</span>
                &nbsp;· Activation schedule: t=5s then every 10s
                &nbsp;· Enemy DEF/INT reduces actual damage dealt (factor unknown)
              </p>

              {stats.abilityDamage.perCycleByChampion.length === 0 ? (
                <p className="text-sm text-gray-400">No champions with active abilities in formation.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Champion · Ability</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Multiplier</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Raw damage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.abilityDamage.perCycleByChampion.map((entry) => {
                        const rawDmg = Math.round(stats.formationInt * entry.rawMultiplier)
                        const champ = CHAMPIONS.find(c => c.id === entry.championId)
                        return (
                          <tr key={entry.championId} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800 dark:text-gray-200">{champ?.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {entry.name}
                                {entry.isReactive && <span className="ml-1 text-amber-600 dark:text-amber-400">(reactive — per saturation window)</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300 text-xs">
                              {entry.label}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                              {fmt(rawDmg)}
                            </td>
                          </tr>
                        )
                      })}
                      {stats.abilityDamage.signatureWeapon && (() => {
                        const sig = stats.abilityDamage.signatureWeapon!
                        const rawDmg = Math.round(stats.formationInt * sig.rawMultiplier)
                        return (
                          <tr className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800 dark:text-gray-200">{sig.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Per activation</div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300 text-xs">
                              INT × {sig.rawMultiplier.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                              {fmt(rawDmg)}
                            </td>
                          </tr>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Champions contribution detail */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Champions Bucket Detail</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Source</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">ATK %</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">INT %</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">DEF %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.championSlots.map((id, i) => {
                      const champ = id ? CHAMPIONS.find((c) => c.id === id) : null
                      if (!champ) return null
                      const matchesElement = champ.element === (flagship?.element ?? 'kinetic')
                      const totalAtk = champ.formationPct.atk + (matchesElement ? champ.passivePct.atk : 0)
                      const totalInt = champ.formationPct.int + (matchesElement ? champ.passivePct.int : 0)
                      const totalDef = champ.formationPct.def + (matchesElement ? champ.passivePct.def : 0)
                      return (
                        <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {champ.name}
                            {!champ.formationConfirmed && <span className="ml-1 text-amber-500">⚠</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{totalAtk > 0 ? `+${totalAtk.toFixed(2)}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{totalInt > 0 ? `+${totalInt.toFixed(2)}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{totalDef > 0 ? `+${totalDef.toFixed(2)}%` : '—'}</td>
                        </tr>
                      )
                    })}
                    {config.droneId && config.droneCount > 0 && (() => {
                      const drone = DRONE_TIERS.find(d => d.id === config.droneId)
                      if (!drone) return null
                      const fp = drone.formationToFlagshipPct
                      return (
                        <tr className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">Drone formation bonus</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{fp.atk > 0 ? `+${fp.atk}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{fp.int > 0 ? `+${fp.int}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{fp.def > 0 ? `+${fp.def}%` : '—'}</td>
                        </tr>
                      )
                    })()}
                    {wohChampions.map(c => {
                      if (!c.woh?.spaceAttr) return null
                      const level = config.wohHonorLevels[c.id] ?? c.woh.honorLevel
                      if (level < c.woh.tierThreshold) return null
                      const { stat, pct: p } = c.woh.spaceAttr
                      return (
                        <tr key={`woh-${c.id}`} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">WoH · {c.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{stat === 'atk' ? `+${p}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{stat === 'int' ? `+${p}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{stat === 'def' ? `+${p}%` : '—'}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">Total Champions %</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">{`+${stats.champsBucket.atk.toFixed(2)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">{`+${stats.champsBucket.int.toFixed(2)}%`}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">{`+${stats.champsBucket.def.toFixed(2)}%`}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  )
}
