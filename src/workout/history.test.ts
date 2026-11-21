import { describe, expect, it } from 'vitest'
import type { Workout, WorkoutSet } from '../data/types.ts'
import {
  bestSet,
  doneExerciseOrder,
  fmtComparison,
  fmtDuration,
  fmtKg,
  groupByMonth,
  monthLabel,
  pluralReps,
  summarizeWorkouts,
  tonnage,
  weekday,
  workoutDetail,
  FREE_WORKOUT_NAME,
} from './history.ts'

const H = 3600_000

function wo(id: number, date: string, opts: Partial<Workout> = {}): Workout {
  const startedAt = new Date(`${date}T18:00:00`).getTime()
  return { id, date, startedAt, finishedAt: startedAt + H, ...opts }
}

let nextId = 1
function set(workoutId: number, exerciseId: number, setIndex: number, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  const id = nextId++
  return { id, workoutId, exerciseId, setIndex, weight, reps, done: true, completedAt: 1_000_000 + id, ...extra }
}

describe('formatting', () => {
  it('names months in Ukrainian nominative', () => {
    expect(monthLabel('2026-11-21')).toBe('Листопад 2026')
    expect(monthLabel('2027-01-03')).toBe('Січень 2027')
    expect(monthLabel('2026-05-09')).toBe('Травень 2026')
    expect(weekday('2026-11-21')).toBe('сб')
    expect(weekday('2026-11-23', 'long')).toBe('понеділок')
  })

  it('formats durations, kilograms and rep plurals', () => {
    expect(fmtDuration(45)).toBe('45 хв')
    expect(fmtDuration(60)).toBe('1 год')
    expect(fmtDuration(75)).toBe('1 год 15 хв')
    expect(fmtKg(12345.4)).toBe('12 345 кг')
    expect(fmtKg(980)).toBe('980 кг')
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map(pluralReps)).toEqual([
      'повтор',
      'повтори',
      'повтори',
      'повторів',
      'повторів',
      'повторів',
      'повтор',
      'повтори',
      'повторів',
    ])
  })

  it('describes the change on the best set', () => {
    expect(fmtComparison({ dWeight: 2.5, dReps: 0 })).toBe('+2.5 кг')
    expect(fmtComparison({ dWeight: 0, dReps: 1 })).toBe('+1 повтор')
    expect(fmtComparison({ dWeight: 0, dReps: -2 })).toBe('−2 повтори')
    expect(fmtComparison({ dWeight: 5, dReps: -3 })).toBe('+5 кг, −3 повтори')
    expect(fmtComparison({ dWeight: 0, dReps: 0 })).toBe('без змін')
  })
})

describe('tonnage and best set', () => {
  it('sums weight × reps of done sets only', () => {
    expect(tonnage([set(1, 1, 0, 60, 10), set(1, 1, 1, 62.5, 8), set(1, 1, 2, 100, 10, { done: false }), set(1, 2, 0, 0, 12)])).toBe(1100)
  })

  it('picks the highest e1RM, earliest on ties', () => {
    const a = set(1, 1, 0, 60, 10) // 80
    const b = set(1, 1, 1, 70, 5) // 81.7
    const c = set(1, 1, 2, 80, 1) // 80
    expect(bestSet([a, b, c])).toEqual({ weight: 70, reps: 5, e1rm: 81.7 })
    expect(bestSet([c, a])).toEqual({ weight: 60, reps: 10, e1rm: 80 })
    expect(bestSet([])).toBeNull()
  })
})

describe('list', () => {
  const templates = new Map([[1, 'Full body A']])
  const workouts = [
    wo(1, '2026-10-30', { templateId: 1 }),
    wo(2, '2026-11-02', { templateId: 7 }), // template deleted
    wo(3, '2026-11-05'),
    wo(4, '2026-11-06', { finishedAt: undefined }), // in progress
    wo(5, '2026-11-05', { startedAt: new Date('2026-11-05T08:00:00').getTime(), finishedAt: new Date('2026-11-05T08:45:00').getTime() }),
  ]
  const sets = [set(1, 1, 0, 50, 10), set(1, 1, 1, 50, 10), set(2, 1, 0, 40, 10), set(3, 2, 0, 20, 12), set(4, 1, 0, 100, 1), set(5, 3, 0, 10, 10)]

  it('lists finished workouts newest first with name, minutes, sets and tonnage', () => {
    const list = summarizeWorkouts(workouts, sets, templates)
    expect(list.map((r) => r.workout.id)).toEqual([3, 5, 2, 1])
    expect(list.map((r) => r.name)).toEqual([FREE_WORKOUT_NAME, FREE_WORKOUT_NAME, FREE_WORKOUT_NAME, 'Full body A'])
    expect(list.find((r) => r.workout.id === 1)).toMatchObject({ minutes: 60, doneSets: 2, tonnage: 1000 })
    expect(list.find((r) => r.workout.id === 5)).toMatchObject({ minutes: 45, doneSets: 1, tonnage: 100 })
  })

  it('groups by month keeping order', () => {
    const groups = groupByMonth(summarizeWorkouts(workouts, sets, templates))
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.workout.id)])).toEqual([
      ['2026-11', 'Листопад 2026', [3, 5, 2]],
      ['2026-10', 'Жовтень 2026', [1]],
    ])
  })
})

describe('detail', () => {
  it('orders exercises by when they were done', () => {
    const s = [set(1, 5, 0, 1, 1, { completedAt: 300 }), set(1, 2, 0, 1, 1, { completedAt: 100 }), set(1, 5, 1, 1, 1, { completedAt: 50 }), set(1, 9, 0, 1, 1, { completedAt: undefined })]
    expect(doneExerciseOrder(s)).toEqual([5, 2, 9])
  })

  const workouts = [wo(1, '2026-11-01'), wo(2, '2026-11-03'), wo(3, '2026-11-05'), wo(4, '2026-11-07', { finishedAt: undefined }), wo(5, '2026-11-02')]
  const sets = [
    // w1: bench 60×10 (80)
    set(1, 1, 0, 60, 10),
    // w5 (Nov 2): bench 60×8 (76), curl 20×10
    set(5, 1, 0, 60, 8),
    set(5, 2, 0, 20, 10),
    // w2 (Nov 3): bench 62.5×10 (83.3) record; 60×10 not
    set(2, 1, 0, 60, 10, { pain: true }),
    set(2, 1, 1, 62.5, 10),
    // w3 (Nov 5): bench 62.5×11 (85.4) record; curl 20×10 same
    set(3, 2, 0, 20, 10),
    set(3, 1, 0, 62.5, 11),
    set(3, 1, 1, 62.5, 9),
    // w4 unfinished: huge bench, must not affect anything
    set(4, 1, 0, 200, 10),
  ]
  const names = new Map<number, string>()

  it('returns null for an unknown workout', () => {
    expect(workoutDetail(99, workouts, sets, names)).toBeNull()
  })

  it('marks the first time and no record on the first workout of an exercise', () => {
    const d = workoutDetail(1, workouts, sets, names)!
    expect(d.name).toBe(FREE_WORKOUT_NAME)
    expect(d.exercises).toHaveLength(1)
    expect(d.exercises[0]).toMatchObject({ exerciseId: 1, firstTime: true, previous: null, best: { weight: 60, reps: 10, e1rm: 80 } })
    expect(d.exercises[0].sets.some((s) => s.record)).toBe(false)
  })

  it('does not mark a record when the best set is below an earlier one', () => {
    const d = workoutDetail(5, workouts, sets, names)!
    const bench = d.exercises.find((e) => e.exerciseId === 1)!
    expect(bench.sets.map((s) => s.record)).toEqual([false])
    expect(bench.previous).toMatchObject({ date: '2026-11-01', workoutId: 1, dWeight: 0, dReps: -2 })
    expect(d.exercises.find((e) => e.exerciseId === 2)!.firstTime).toBe(true)
  })

  it('marks only the best set as a record when it beats all earlier workouts', () => {
    const d = workoutDetail(2, workouts, sets, names)!
    const bench = d.exercises[0]
    expect(bench.sets.map((s) => [s.set.weight, s.set.reps, s.record, !!s.set.pain])).toEqual([
      [60, 10, false, true],
      [62.5, 10, true, false],
    ])
    expect(bench.best).toEqual({ weight: 62.5, reps: 10, e1rm: 83.3 })
    // previous = the latest earlier workout (Nov 2), not the oldest
    expect(bench.previous).toMatchObject({ date: '2026-11-02', dWeight: 2.5, dReps: 2 })
    expect(d).toMatchObject({ doneSets: 2, tonnage: 1225, minutes: 60 })
  })

  it('compares with the previous workout and ignores unfinished ones', () => {
    const d = workoutDetail(3, workouts, sets, names)!
    expect(d.exercises.map((e) => e.exerciseId)).toEqual([2, 1])
    const [curl, bench] = d.exercises
    expect(curl.previous).toMatchObject({ date: '2026-11-02', dWeight: 0, dReps: 0 })
    expect(curl.sets[0].record).toBe(false) // equal is not a record
    expect(bench.sets.map((s) => s.record)).toEqual([true, false])
    expect(bench.previous).toMatchObject({ date: '2026-11-03', dWeight: 0, dReps: 1 })
    expect(fmtComparison(bench.previous!)).toBe('+1 повтор')
  })
})
