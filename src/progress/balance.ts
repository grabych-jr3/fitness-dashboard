import type { MuscleGroup, MuscleVolume } from '../data/types.ts'

export type Status = 'low' | 'ok' | 'high'

export type BalanceRow = { group: MuscleGroup; sets: number; status: Status }

/** Classifies weekly sets per group against the target range and sorts the weakest first. */
export function balanceRows(volume: MuscleVolume, target: { min: number; max: number }, groups: readonly MuscleGroup[]): BalanceRow[] {
  return groups
    .map((group) => {
      const sets = volume[group] ?? 0
      const status: Status = sets < target.min ? 'low' : sets > target.max ? 'high' : 'ok'
      return { group, sets, status }
    })
    .sort((a, b) => a.sets / target.min - b.sets / target.min || a.group.localeCompare(b.group))
}
