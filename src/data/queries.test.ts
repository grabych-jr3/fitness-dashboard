import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { weekRange } from './dates'
import { db } from './db'
import {
  computeMuscleVolume,
  lastPerformance,
  latestScan,
  mergeWeightSeries,
  personalRecords,
  previousScan,
  weeklyMuscleVolume,
  weightSeries,
} from './queries'
import { FIRST_SCAN } from './seed'
import { resetDb } from './testUtils'
import type { Exercise, InbodyScan, WorkoutSet } from './types'

beforeEach(resetDb)

const scan = (date: string, weight: number, createdAt = 1): InbodyScan => ({ ...structuredClone(FIRST_SCAN), date, weight, createdAt })

describe('scans', () => {
  it('latestScan / previousScan follow date order', async () => {
    await db.inbodyScans.bulkAdd([scan('2026-12-01', 79), scan('2026-11-01', 77.4), scan('2026-11-15', 78)])
    expect((await latestScan())?.date).toBe('2026-12-01')
    expect((await previousScan())?.date).toBe('2026-11-15')
    const mid = (await db.inbodyScans.where('date').equals('2026-11-15').first())!
    expect((await previousScan(mid))?.date).toBe('2026-11-01')
    const first = (await db.inbodyScans.where('date').equals('2026-11-01').first())!
    expect(await previousScan(first)).toBeUndefined()
  })
})

describe('weightSeries', () => {
  it('merges by date, scan wins on the same date', () => {
    const series = mergeWeightSeries(
      [scan('2026-11-01', 77.4), scan('2026-11-10', 78.1)],
      [
        { id: 1, date: '2026-11-05', weight: 77.9 },
        { id: 2, date: '2026-11-10', weight: 80 },
        { id: 3, date: '2026-10-30', weight: 77 },
        { id: 4, date: '2026-11-05', weight: 78 },
      ],
    )
    expect(series).toEqual([
      { date: '2026-10-30', weight: 77, source: 'weighIn' },
      { date: '2026-11-01', weight: 77.4, source: 'scan' },
      { date: '2026-11-05', weight: 78, source: 'weighIn' },
      { date: '2026-11-10', weight: 78.1, source: 'scan' },
    ])
  })

  it('reads from the db and filters by date range', async () => {
    await db.inbodyScans.add(scan('2026-11-01', 77.4))
    await db.weighIns.bulkAdd([
      { date: '2026-11-01', weight: 76 },
      { date: '2026-11-08', weight: 78 },
      { date: '2026-12-08', weight: 79 },
    ])
    expect(await weightSeries()).toHaveLength(3)
    expect(await weightSeries('2026-11-01', '2026-11-30')).toEqual([
      { date: '2026-11-01', weight: 77.4, source: 'scan' },
      { date: '2026-11-08', weight: 78, source: 'weighIn' },
    ])
  })
})

const ex = (id: number, primary: Exercise['primary'], secondary: Exercise['secondary'] = []): Exercise => ({
  id,
  name: `ex${id}`,
  primary,
  secondary,
  archived: false,
})

const set = (workoutId: number, exerciseId: number, setIndex: number, weight: number, reps: number, done = true): WorkoutSet => ({
  workoutId,
  exerciseId,
  setIndex,
  weight,
  reps,
  done,
})

describe('weeklyMuscleVolume', () => {
  it('counts primary as 1 and secondary as 0.5, only done sets', () => {
    const exercises = new Map([
      [1, ex(1, ['chest'], ['triceps', 'shoulders'])],
      [2, ex(2, ['back'], ['biceps'])],
      [3, ex(3, ['chest', 'triceps'], ['triceps'])],
    ])
    const v = computeMuscleVolume(
      [set(1, 1, 0, 80, 8), set(1, 1, 1, 80, 8), set(1, 1, 2, 80, 8, false), set(1, 2, 0, 60, 10), set(1, 3, 0, 0, 10)],
      exercises,
    )
    expect(v.chest).toBe(3)
    expect(v.triceps).toBe(2) // 0.5 + 0.5 + 1 (ex3 lists triceps in both, counted once as primary)
    expect(v.shoulders).toBe(1)
    expect(v.back).toBe(1)
    expect(v.biceps).toBe(0.5)
    expect(v.quads).toBe(0)
  })

  it('only includes workouts inside the inclusive date range', async () => {
    await db.exercises.bulkAdd([ex(1, ['quads'], ['glutes'])])
    const { from, to } = weekRange('2026-11-18')
    expect([from, to]).toEqual(['2026-11-16', '2026-11-22'])
    await db.workouts.bulkAdd([
      { id: 1, date: '2026-11-15', startedAt: 1 },
      { id: 2, date: '2026-11-16', startedAt: 2 },
      { id: 3, date: '2026-11-22', startedAt: 3 },
    ])
    await db.sets.bulkAdd([set(1, 1, 0, 100, 10), set(2, 1, 0, 100, 10), set(2, 1, 1, 100, 10), set(3, 1, 0, 100, 10)])
    const v = await weeklyMuscleVolume(from, to)
    expect(v.quads).toBe(3)
    expect(v.glutes).toBe(1.5)
    expect((await weeklyMuscleVolume('2027-01-01', '2027-01-07')).quads).toBe(0)
  })
})

describe('lastPerformance & personalRecords', () => {
  beforeEach(async () => {
    await db.exercises.bulkAdd([ex(1, ['chest']), ex(2, ['back'])])
    await db.workouts.bulkAdd([
      { id: 1, date: '2026-11-10', startedAt: 10, finishedAt: 11 },
      { id: 2, date: '2026-11-12', startedAt: 20, finishedAt: 21 },
      { id: 3, date: '2026-11-14', startedAt: 30 }, // in progress
    ])
    await db.sets.bulkAdd([
      set(1, 1, 0, 80, 10),
      set(1, 1, 1, 85, 6),
      set(2, 1, 1, 82.5, 8),
      set(2, 1, 0, 82.5, 9),
      set(2, 2, 0, 60, 12),
      set(3, 1, 0, 100, 5),
    ])
  })

  it('returns sets of the most recent finished workout with that exercise', async () => {
    const last = await lastPerformance(1)
    expect(last?.workout.id).toBe(2)
    expect(last?.sets.map((s) => [s.setIndex, s.reps])).toEqual([
      [0, 9],
      [1, 8],
    ])
    expect((await lastPerformance(1, 2))?.workout.id).toBe(1)
    expect(await lastPerformance(99)).toBeUndefined()
  })

  it('finds the best e1RM per exercise', async () => {
    const prs = await personalRecords()
    expect(prs.map((p) => [p.exerciseId, p.e1rm, p.workoutId])).toEqual([
      [1, 116.7, 3], // 100 × (1 + 5/30)
      [2, 84, 2],
    ])
  })
})
