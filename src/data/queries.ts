import { e1rm } from '../lib/e1rm'
import { DEFAULT_RANGE, DEFAULT_STEP, recommend, type Recommendation, type RepRange, type Session } from '../progress/progression'
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

/** Finished sessions of an exercise (done sets only), oldest first. */
export async function exerciseSessions(exerciseId: number, excludeWorkoutId?: number): Promise<Session[]> {
  const sets = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter((s) => s.done && s.workoutId !== excludeWorkoutId)
  const ids = [...new Set(sets.map((s) => s.workoutId))]
  const workouts = (await db.workouts.bulkGet(ids)).filter((w): w is Workout => w !== undefined && w.finishedAt !== undefined).sort(compareWorkouts)
  return workouts.map((w) => ({
    date: w.date,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .sort((a, b) => a.setIndex - b.setIndex)
      .map((s) => ({ weight: s.weight, reps: s.reps, pain: s.pain })),
  }))
}

/** Guess of the weight step from the exercise name: dumbbells go in pairs of 2 kg, the leg press in 5 kg plates. */
export function defaultWeightStep(name: string): number {
  const n = name.toLocaleLowerCase('uk')
  if (n.includes('жим ногами')) return 5
  if (n.includes('гантел') || n.includes('молотки')) return 2
  return DEFAULT_STEP
}

export const weightStepOf = (e: Pick<Exercise, 'name' | 'weightStep'>) => e.weightStep ?? defaultWeightStep(e.name)

/**
 * Rep range and planned sets of an exercise: from the given template, else from
 * any template that has it, else the default 8–12.
 */
export async function planFor(exerciseId: number, templateId?: number): Promise<{ range: RepRange; targetSets?: number }> {
  const templates = await db.templates.toArray()
  const own = templates.find((t) => t.id === templateId)?.items.find((i) => i.exerciseId === exerciseId)
  const any = own ?? templates.flatMap((t) => t.items).find((i) => i.exerciseId === exerciseId)
  return any ? { range: { repMin: any.repMin, repMax: any.repMax }, targetSets: own?.targetSets } : { range: DEFAULT_RANGE }
}

/** Recommendation for the next time an exercise is done. */
export async function nextTarget(exerciseId: number, opts: { templateId?: number; excludeWorkoutId?: number; targetSets?: number } = {}): Promise<Recommendation> {
  const [history, plan, exercise] = await Promise.all([exerciseSessions(exerciseId, opts.excludeWorkoutId), planFor(exerciseId, opts.templateId), db.exercises.get(exerciseId)])
  return recommend(history, plan.range, exercise ? weightStepOf(exercise) : DEFAULT_STEP, opts.targetSets ?? plan.targetSets)
}

export interface NextStep {
  exerciseId: number
  name: string
  rec: Recommendation
}

/** What changes next time for every exercise of a (just finished) workout, in the order they were done. */
export async function nextStepsAfter(workoutId: number): Promise<NextStep[]> {
  const workout = await db.workouts.get(workoutId)
  const sets = (await db.sets.where('workoutId').equals(workoutId).toArray()).filter((s) => s.done).sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0) || (a.id ?? 0) - (b.id ?? 0))
  const ids = [...new Set(sets.map((s) => s.exerciseId))]
  const exercises = await db.exercises.bulkGet(ids)
  return Promise.all(ids.map(async (id, i) => ({ exerciseId: id, name: exercises[i]?.name ?? '—', rec: await nextTarget(id, { templateId: workout?.templateId }) })))
}

/** Next target for every exercise that has history, most urgent first (plateau, more weight, deload, pain…). */
export async function allNextSteps(): Promise<NextStep[]> {
  const done = await db.sets.filter((s) => s.done).toArray()
  const ids = [...new Set(done.map((s) => s.exerciseId))]
  const exercises = await db.exercises.bulkGet(ids)
  const out: NextStep[] = []
  for (let i = 0; i < ids.length; i++) {
    const rec = await nextTarget(ids[i])
    if (rec.action !== 'first' && exercises[i] && !exercises[i]!.archived) out.push({ exerciseId: ids[i], name: exercises[i]!.name, rec })
  }
  const rank = (r: Recommendation) => (r.plateau ? 0 : { 'up-weight': 1, deload: 2, pain: 3, hold: 4, 'up-reps': 5, first: 6 }[r.action])
  return out.sort((a, b) => rank(a.rec) - rank(b.rec) || a.name.localeCompare(b.name, 'uk'))
}
