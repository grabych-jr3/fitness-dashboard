import { addDays, weekRange } from '../data/dates.ts'
import type { Workout, WorkoutSet } from '../data/types.ts'
import { e1rm } from '../lib/e1rm.ts'

export type E1rmPoint = { date: string; e1rm: number; weight: number; reps: number }

/** Best e1RM of one exercise per workout date (done sets of finished workouts only). */
export function e1rmSeries(exerciseId: number, sets: readonly WorkoutSet[], workouts: readonly Workout[]): E1rmPoint[] {
  const finished = new Map(workouts.filter((w) => w.finishedAt).map((w) => [w.id!, w]))
  const best = new Map<string, E1rmPoint>()
  for (const s of sets) {
    const w = finished.get(s.workoutId)
    if (!w || !s.done || s.exerciseId !== exerciseId) continue
    const v = e1rm(s.weight, s.reps)
    const cur = best.get(w.date)
    if (!cur || v > cur.e1rm) best.set(w.date, { date: w.date, e1rm: v, weight: s.weight, reps: s.reps })
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export type WeekVolume = { week: string; volume: number; sets: number }

/** Tonnage (kg × reps) and done sets for the last `weeks` Monday-based weeks, oldest first. */
export function weeklyVolume(sets: readonly WorkoutSet[], workouts: readonly Workout[], weeks = 8, today?: string): WeekVolume[] {
  const { from: thisMonday } = weekRange(today)
  const result: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({ week: addDays(thisMonday, -7 * (weeks - 1 - i)), volume: 0, sets: 0 }))
  const byId = new Map(workouts.map((w) => [w.id!, w]))
  for (const s of sets) {
    const w = byId.get(s.workoutId)
    if (!w || !s.done) continue
    const monday = weekRange(w.date).from
    const bucket = result.find((r) => r.week === monday)
    if (!bucket) continue
    bucket.volume += s.weight * s.reps
    bucket.sets += 1
  }
  return result.map((r) => ({ ...r, volume: Math.round(r.volume) }))
}
