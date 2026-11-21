import { e1rm } from '../lib/e1rm.ts'
import type { IsoDate, Workout, WorkoutSet } from '../data/types.ts'

/*
 * Pure helpers for the workout history: list rows, month groups, per-exercise
 * summaries, records at the time of a workout and "last time" comparison.
 * Only finished workouts and done sets count.
 */

export const FREE_WORKOUT_NAME = 'Вільне тренування'

const MONTHS_NOMINATIVE = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
]

/** '2026-11-21' → 'Листопад 2026'. */
export function monthLabel(date: IsoDate): string {
  const [y, m] = date.split('-').map(Number)
  return `${MONTHS_NOMINATIVE[m - 1] ?? '?'} ${y}`
}

/** Chronological order of workouts (oldest first). */
export function compareWorkouts(a: Workout, b: Workout): number {
  return a.date.localeCompare(b.date) || a.startedAt - b.startedAt || (a.id ?? 0) - (b.id ?? 0)
}

export function isFinished(w: Workout): boolean {
  return w.finishedAt !== undefined
}

/** Sum of weight × reps over done sets, kg. */
export function tonnage(sets: readonly WorkoutSet[]): number {
  let total = 0
  for (const s of sets) if (s.done && s.weight > 0 && s.reps > 0) total += s.weight * s.reps
  return Math.round(total * 10) / 10
}

/** Whole minutes between start and finish (0 while unfinished). */
export function durationMinutes(w: Workout): number {
  if (w.finishedAt === undefined) return 0
  return Math.max(0, Math.round((w.finishedAt - w.startedAt) / 60000))
}

/** 45 → '45 хв', 75 → '1 год 15 хв', 120 → '2 год'. */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} хв`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} год ${m} хв` : `${h} год`
}

/** Kilograms with thin-space thousands: 12345 → '12 345 кг'. */
export function fmtKg(kg: number): string {
  const rounded = Math.round(kg)
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} кг`
}

/** Weight without trailing zeros: 60 → '60', 62.5 → '62.5'. */
export function fmtWeight(kg: number): string {
  return String(Math.round(kg * 100) / 100)
}

/** Ukrainian plural: 1 повтор, 2 повтори, 5 повторів. */
export function pluralReps(n: number): string {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return 'повтор'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'повтори'
  return 'повторів'
}

/** Template name, or the free-workout label if there is none or it was deleted. */
export function workoutName(w: Workout, templateNames: ReadonlyMap<number, string>): string {
  return (w.templateId !== undefined && templateNames.get(w.templateId)) || FREE_WORKOUT_NAME
}

// ---------- List ----------

export interface WorkoutSummary {
  workout: Workout
  name: string
  minutes: number
  doneSets: number
  tonnage: number
}

/** Finished workouts, newest first, with set count and tonnage. */
export function summarizeWorkouts(
  workouts: readonly Workout[],
  sets: readonly WorkoutSet[],
  templateNames: ReadonlyMap<number, string>,
): WorkoutSummary[] {
  const byWorkout = groupSetsByWorkout(sets)
  return workouts
    .filter(isFinished)
    .sort((a, b) => compareWorkouts(b, a))
    .map((w) => {
      const ws = byWorkout.get(w.id!) ?? []
      return {
        workout: w,
        name: workoutName(w, templateNames),
        minutes: durationMinutes(w),
        doneSets: ws.filter((s) => s.done).length,
        tonnage: tonnage(ws),
      }
    })
}

export interface MonthGroup<T> {
  /** 'YYYY-MM' */
  key: string
  label: string
  items: T[]
}

/** Groups items (already sorted) by month of their workout date, keeping order. */
export function groupByMonth<T extends { workout: Workout }>(items: readonly T[]): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  for (const item of items) {
    const key = item.workout.date.slice(0, 7)
    let g = groups.at(-1)
    if (!g || g.key !== key) {
      g = groups.find((x) => x.key === key)
      if (!g) {
        g = { key, label: monthLabel(item.workout.date), items: [] }
        groups.push(g)
      }
    }
    g.items.push(item)
  }
  return groups
}

// ---------- Detail ----------

function groupSetsByWorkout(sets: readonly WorkoutSet[]): Map<number, WorkoutSet[]> {
  const map = new Map<number, WorkoutSet[]>()
  for (const s of sets) {
    const list = map.get(s.workoutId)
    if (list) list.push(s)
    else map.set(s.workoutId, [s])
  }
  return map
}

/**
 * Exercise ids in the order they were done: by the first completed set, then
 * (for sets without a completion time) by the first set id.
 */
export function doneExerciseOrder(sets: readonly WorkoutSet[]): number[] {
  const first = new Map<number, { at: number; id: number }>()
  for (const s of sets) {
    const at = s.completedAt ?? Infinity
    const id = s.id ?? Infinity
    const cur = first.get(s.exerciseId)
    if (!cur || at < cur.at || (at === cur.at && id < cur.id)) first.set(s.exerciseId, { at, id })
  }
  return [...first.entries()]
    .sort((a, b) => (a[1].at === b[1].at ? a[1].id - b[1].id : a[1].at - b[1].at))
    .map(([id]) => id)
}

export interface BestSet {
  weight: number
  reps: number
  e1rm: number
}

/** Highest-e1RM done set (earliest wins ties), or null if there is none. */
export function bestSet(sets: readonly WorkoutSet[]): BestSet | null {
  let best: BestSet | null = null
  for (const s of [...sets].sort((a, b) => a.setIndex - b.setIndex)) {
    if (!s.done) continue
    const value = e1rm(s.weight, s.reps)
    if (value <= 0) continue
    if (!best || value > best.e1rm) best = { weight: s.weight, reps: s.reps, e1rm: value }
  }
  return best
}

export interface DetailSet {
  set: WorkoutSet
  e1rm: number
  /** this set set a new best e1RM for the exercise at that time */
  record: boolean
}

export interface Comparison {
  date: IsoDate
  workoutId: number
  previous: BestSet
  /** kg, current best minus previous best */
  dWeight: number
  /** reps, current best minus previous best */
  dReps: number
}

export interface ExerciseSummary {
  exerciseId: number
  sets: DetailSet[]
  best: BestSet | null
  /** last earlier finished workout with this exercise, if any */
  previous: Comparison | null
  /** no earlier finished workout had this exercise */
  firstTime: boolean
}

export interface WorkoutDetailData {
  workout: Workout
  name: string
  minutes: number
  doneSets: number
  tonnage: number
  exercises: ExerciseSummary[]
}

/**
 * Everything the detail view shows for one finished workout. A set is marked
 * as a record when it is the best set of the exercise in this workout and its
 * e1RM beats every earlier finished workout (the first time doing an exercise
 * is not a record, it is `firstTime`).
 */
export function workoutDetail(
  workoutId: number,
  workouts: readonly Workout[],
  sets: readonly WorkoutSet[],
  templateNames: ReadonlyMap<number, string>,
): WorkoutDetailData | null {
  const workout = workouts.find((w) => w.id === workoutId)
  if (!workout) return null

  const byWorkout = groupSetsByWorkout(sets)
  const own = (byWorkout.get(workoutId) ?? []).filter((s) => s.done)
  const earlier = workouts.filter((w) => w.id !== workoutId && isFinished(w) && compareWorkouts(w, workout) < 0).sort(compareWorkouts)

  const exercises = doneExerciseOrder(own).map((exerciseId): ExerciseSummary => {
    const exSets = own.filter((s) => s.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex)
    const best = bestSet(exSets)

    let priorBest = 0
    let last: { workout: Workout; best: BestSet } | null = null
    for (const w of earlier) {
      const b = bestSet((byWorkout.get(w.id!) ?? []).filter((s) => s.exerciseId === exerciseId))
      if (!b) continue
      priorBest = Math.max(priorBest, b.e1rm)
      last = { workout: w, best: b }
    }

    const firstTime = last === null
    const recordIdx = best && !firstTime && best.e1rm > priorBest ? exSets.findIndex((s) => s.done && e1rm(s.weight, s.reps) === best.e1rm) : -1

    return {
      exerciseId,
      sets: exSets.map((s, i) => ({ set: s, e1rm: e1rm(s.weight, s.reps), record: i === recordIdx })),
      best,
      firstTime,
      previous:
        last && best
          ? {
              date: last.workout.date,
              workoutId: last.workout.id!,
              previous: last.best,
              dWeight: Math.round((best.weight - last.best.weight) * 100) / 100,
              dReps: best.reps - last.best.reps,
            }
          : null,
    }
  })

  return {
    workout,
    name: workoutName(workout, templateNames),
    minutes: durationMinutes(workout),
    doneSets: own.length,
    tonnage: tonnage(own),
    exercises,
  }
}

const sign = (v: number): string => (v > 0 ? '+' : '−')

/** '+2.5 кг', '+1 повтор', '+2.5 кг, −2 повтори', or 'без змін'. */
export function fmtComparison(c: Pick<Comparison, 'dWeight' | 'dReps'>): string {
  const parts: string[] = []
  if (c.dWeight !== 0) parts.push(`${sign(c.dWeight)}${fmtWeight(Math.abs(c.dWeight))} кг`)
  if (c.dReps !== 0) parts.push(`${sign(c.dReps)}${Math.abs(c.dReps)} ${pluralReps(c.dReps)}`)
  return parts.length ? parts.join(', ') : 'без змін'
}

/** Direction of the change on the best set: by e1RM (weight × reps together). */
export function comparisonTrend(c: Comparison, current: BestSet): 'up' | 'down' | 'same' {
  if (current.e1rm > c.previous.e1rm) return 'up'
  if (current.e1rm < c.previous.e1rm) return 'down'
  return 'same'
}

/** Epoch ms → 'HH:MM' local time. */
export function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const WEEKDAYS_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const WEEKDAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота']

/** '2026-11-21' → 'сб' (short) or 'субота' (long). */
export function weekday(date: IsoDate, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return (style === 'long' ? WEEKDAYS : WEEKDAYS_SHORT)[dow]
}
