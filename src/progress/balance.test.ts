import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS, type MuscleVolume } from '../data/types.ts'
import { balanceRows } from './balance.ts'

describe('balanceRows', () => {
  it('marks groups below, inside and above the target and sorts weakest first', () => {
    const volume = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 12])) as MuscleVolume
    volume.calves = 3
    volume.chest = 22
    const rows = balanceRows(volume, { min: 10, max: 20 }, MUSCLE_GROUPS)
    expect(rows[0]).toEqual({ group: 'calves', sets: 3, status: 'low' })
    expect(rows.at(-1)).toEqual({ group: 'chest', sets: 22, status: 'high' })
    expect(rows.filter((r) => r.status === 'ok')).toHaveLength(MUSCLE_GROUPS.length - 2)
  })
})
