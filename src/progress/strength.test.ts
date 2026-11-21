import { describe, expect, it } from 'vitest'
import type { Workout, WorkoutSet } from '../data/types.ts'
import { e1rmSeries, weeklyVolume } from './strength.ts'

const workouts: Workout[] = [
  { id: 1, date: '2026-11-16', startedAt: 1, finishedAt: 2 },
  { id: 2, date: '2026-11-18', startedAt: 3, finishedAt: 4 },
  { id: 3, date: '2026-11-20', startedAt: 5 }, // in progress
]
const set = (workoutId: number, exerciseId: number, weight: number, reps: number, done = true): WorkoutSet => ({
  workoutId,
  exerciseId,
  setIndex: 0,
  weight,
  reps,
  done,
})

describe('strength', () => {
  it('takes the best e1RM per finished workout', () => {
    const sets = [set(1, 7, 60, 10), set(1, 7, 65, 6), set(2, 7, 70, 5), set(2, 7, 100, 10, false), set(3, 7, 200, 1), set(2, 8, 50, 10)]
    const s = e1rmSeries(7, sets, workouts)
    expect(s.map((p) => p.date)).toEqual(['2026-11-16', '2026-11-18'])
    expect(s[0].e1rm).toBe(80) // 60×10 → 80 beats 65×6 → 78
    expect(s[1].e1rm).toBe(81.7)
  })

  it('sums tonnage per Monday week', () => {
    const v = weeklyVolume([set(1, 7, 60, 10), set(2, 8, 50, 10), set(2, 8, 50, 10, false)], workouts, 2, '2026-11-21')
    expect(v).toEqual([
      { week: '2026-11-09', volume: 0, sets: 0 },
      { week: '2026-11-16', volume: 1100, sets: 2 },
    ])
  })
})
