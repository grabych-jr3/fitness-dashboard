import { e1rm } from '../lib/e1rm'
import { db } from './db'
import {
  MUSCLE_GROUPS,
  type Exercise,
  type InbodyScan,
  type IsoDate,
  type MuscleVolume,
  type PersonalRecord,
  type WeighIn,
  type WeightPoint,
  type Workout,
  type WorkoutSet,
} from './types'

// ---------- InBody scans ----------

function compareScans(a: InbodyScan, b: InbodyScan): number {
  return a.date.localeCompare(b.date) || a.createdAt - b.createdAt || (a.id ?? 0) - (b.id ?? 0)
}

/** All scans, oldest first (ties on the same date broken by createdAt). */
export async function scansSorted(): Promise<InbodyScan[]> {
  const all = await db.inbodyScans.toArray()
  return all.sort(compareScans)
}

export async function latestScan(): Promise<InbodyScan | undefined> {
  return (await scansSorted()).at(-1)
}

/**
 * The scan right before `relativeTo` (by date order), or before the latest
 * scan when omitted. Used for "change since previous scan" cards.
 */
export async function previousScan(relativeTo?: InbodyScan): Promise<InbodyScan | undefined> {
  const all = await scansSorted()
  if (!relativeTo) return all.at(-2)
  const idx = relativeTo.id === undefined ? -1 : all.findIndex((s) => s.id === relativeTo.id)
  if (idx >= 0) return idx > 0 ? all[idx - 1] : undefined
  return all.filter((s) => compareScans(s, relativeTo) < 0).at(-1)
}

// ---------- Weight ----------

/**
 * Merges scans and weigh-ins into one series sorted by date, one point per
 * date. A scan wins over a weigh-in on the same date; among several entries
 * of one kind on a date, the last one (highest id / createdAt) wins.
 */
export function mergeWeightSeries(scans: readonly InbodyScan[], weighIns: readonly WeighIn[]): WeightPoint[] {
  const byDate = new Map<IsoDate, WeightPoint>()
  const sortedWeighIns = [...weighIns].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  for (const w of sortedWeighIns) byDate.set(w.date, { date: w.date, weight: w.weight, source: 'weighIn' })
  for (const s of [...scans].sort(compareScans)) byDate.set(s.date, { date: s.date, weight: s.weight, source: 'scan' })
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function weightSeries(fromDate?: IsoDate, toDate?: IsoDate): Promise<WeightPoint[]> {
  const lo = fromDate ?? '0000-01-01'
  const hi = toDate ?? '9999-12-31'
  const [scans, weighIns] = await Promise.all([
    db.inbodyScans.where('date').between(lo, hi, true, true).toArray(),
    db.weighIns.where('date').between(lo, hi, true, true).toArray(),
  ])
  return mergeWeightSeries(scans, weighIns)
}

// ---------- Workouts ----------

function compareWorkouts(a: Workout, b: Workout): number {
  return a.date.localeCompare(b.date) || a.startedAt - b.startedAt
}

export interface LastPerformance {
  workout: Workout
  /** sets of that exercise in that workout, ordered by setIndex */
  sets: WorkoutSet[]
}

/**
 * Sets of `exerciseId` from the most recent *finished* workout that contains
 * it. Pass `excludeWorkoutId` to ignore the workout currently in progress.
 */
export async function lastPerformance(
  exerciseId: number,
  excludeWorkoutId?: number,
): Promise<LastPerformance | undefined> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const workoutIds = [...new Set(sets.map((s) => s.workoutId))].filter((id) => id !== excludeWorkoutId)
  if (workoutIds.length === 0) return undefined

  const workouts = (await db.workouts.bulkGet(workoutIds)).filter(
    (w): w is Workout => w !== undefined && w.finishedAt !== undefined,
  )
  const workout = workouts.sort(compareWorkouts).at(-1)
  if (!workout) return undefined

  return {
    workout,
    sets: sets.filter((s) => s.workoutId === workout.id).sort((a, b) => a.setIndex - b.setIndex),
  }
}

export function emptyMuscleVolume(): MuscleVolume {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as MuscleVolume
}

/**
 * Weekly balance: each *done* set adds 1 to every primary group of its
 * exercise and 0.5 to every secondary group (a group listed in both counts
 * only as primary).
 */
export function computeMuscleVolume(
  sets: readonly WorkoutSet[],
  exercisesById: ReadonlyMap<number, Exercise>,
): MuscleVolume {
  const volume = emptyMuscleVolume()
  for (const set of sets) {
    if (!set.done) continue
    const ex = exercisesById.get(set.exerciseId)
    if (!ex) continue
    const primary = new Set(ex.primary)
    for (const g of primary) volume[g] += 1
    for (const g of new Set(ex.secondary)) if (!primary.has(g)) volume[g] += 0.5
  }
  return volume
}

/** Set count per muscle group for workouts dated within [fromDate, toDate] (inclusive). */
export async function weeklyMuscleVolume(fromDate: IsoDate, toDate: IsoDate): Promise<MuscleVolume> {
  const workoutIds = (await db.workouts.where('date').between(fromDate, toDate, true, true).primaryKeys()).filter(
    (id): id is number => typeof id === 'number',
  )
  if (workoutIds.length === 0) return emptyMuscleVolume()
  const [sets, exercises] = await Promise.all([
    db.sets.where('workoutId').anyOf(workoutIds).toArray(),
    db.exercises.toArray(),
  ])
  return computeMuscleVolume(sets, new Map(exercises.map((e) => [e.id as number, e])))
}

/**
 * Best estimated 1RM per exercise over all done sets (ties: the earlier set
 * keeps the record). Sorted by exerciseId.
 */
export async function personalRecords(): Promise<PersonalRecord[]> {
  const [sets, workouts] = await Promise.all([db.sets.toArray(), db.workouts.toArray()])
  const workoutById = new Map(workouts.map((w) => [w.id as number, w]))
  const best = new Map<number, PersonalRecord>()

  const ordered = sets
    .filter((s) => s.done && workoutById.has(s.workoutId))
    .sort(
      (a, b) =>
        compareWorkouts(workoutById.get(a.workoutId)!, workoutById.get(b.workoutId)!) || a.setIndex - b.setIndex,
    )

  for (const s of ordered) {
    const value = e1rm(s.weight, s.reps)
    if (value <= 0) continue
    const current = best.get(s.exerciseId)
    if (!current || value > current.e1rm) {
      best.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        e1rm: value,
        weight: s.weight,
        reps: s.reps,
        date: workoutById.get(s.workoutId)!.date,
        workoutId: s.workoutId,
      })
    }
  }
  return [...best.values()].sort((a, b) => a.exerciseId - b.exerciseId)
}
