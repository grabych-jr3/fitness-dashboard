import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { nextTarget } from '../data/queries.ts'
import type { WorkoutSet } from '../data/types.ts'
import { doneExerciseOrder } from './history.ts'

const DEFAULT_SETS = 3
const DEFAULT_REPS = 10

/** Exercise ids of a workout in the order they were added (first set id wins). */
export function exerciseOrder(sets: readonly WorkoutSet[]): number[] {
  const first = new Map<number, number>()
  for (const s of sets) {
    const cur = first.get(s.exerciseId)
    if (cur === undefined || (s.id ?? Infinity) < cur) first.set(s.exerciseId, s.id ?? Infinity)
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
}

/** Planned sets for an exercise, prefilled with the double-progression target for today. */
async function plannedSets(workoutId: number, exerciseId: number, opts: { count?: number; templateId?: number } = {}): Promise<WorkoutSet[]> {
  const rec = await nextTarget(exerciseId, { templateId: opts.templateId, excludeWorkoutId: workoutId, targetSets: opts.count })
  const count = opts.count ?? (rec.action === 'first' ? DEFAULT_SETS : rec.reps.length)
  return Array.from({ length: count }, (_, i) => ({
    workoutId,
    exerciseId,
    setIndex: i,
    weight: rec.weight,
    reps: rec.reps[i] ?? rec.reps.at(-1) ?? DEFAULT_REPS,
    done: false,
  }))
}

/** Starts a workout, optionally from a template. Returns the new workout id. */
export async function startWorkout(templateId?: number): Promise<number> {
  return db.transaction('rw', [db.workouts, db.sets, db.templates, db.exercises], async () => {
    const workoutId = (await db.workouts.add({ date: toIsoDate(), templateId, startedAt: Date.now() })) as number
    if (templateId !== undefined) {
      const template = await db.templates.get(templateId)
      for (const item of template?.items ?? []) {
        await db.sets.bulkAdd(await plannedSets(workoutId, item.exerciseId, { count: item.targetSets, templateId }))
      }
    }
    return workoutId
  })
}

export async function addExercise(workoutId: number, exerciseId: number): Promise<void> {
  const existing = await db.sets.where('[workoutId+exerciseId]').equals([workoutId, exerciseId]).count()
  if (existing > 0) return
  const workout = await db.workouts.get(workoutId)
  await db.sets.bulkAdd(await plannedSets(workoutId, exerciseId, { templateId: workout?.templateId }))
}

/** Adds one more set, copying the weight and reps of the previous one. */
export async function addSet(workoutId: number, exerciseId: number): Promise<void> {
  const sets = await db.sets.where('[workoutId+exerciseId]').equals([workoutId, exerciseId]).sortBy('setIndex')
  const prev = sets.at(-1)
  await db.sets.add({
    workoutId,
    exerciseId,
    setIndex: (prev?.setIndex ?? -1) + 1,
    weight: prev?.weight ?? 0,
    reps: prev?.reps ?? DEFAULT_REPS,
    done: false,
  })
}

export async function updateSet(id: number, patch: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'pain'>>): Promise<void> {
  await db.sets.update(id, patch)
}

/** Marks a set done (or not). Returns the new state. */
export async function toggleDone(id: number): Promise<boolean> {
  const set = await db.sets.get(id)
  if (!set) return false
  const done = !set.done
  await db.sets.update(id, done ? { done, completedAt: Date.now() } : { done, completedAt: undefined })
  return done
}

/** Removes a set and renumbers the remaining ones of that exercise. */
export async function removeSet(id: number): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(id)
    if (!set) return
    await db.sets.delete(id)
    const rest = await db.sets.where('[workoutId+exerciseId]').equals([set.workoutId, set.exerciseId]).sortBy('setIndex')
    await Promise.all(rest.map((s, i) => (s.setIndex === i ? null : db.sets.update(s.id!, { setIndex: i }))))
  })
}

export async function removeExercise(workoutId: number, exerciseId: number): Promise<void> {
  await db.sets.where('[workoutId+exerciseId]').equals([workoutId, exerciseId]).delete()
}

/**
 * Finishes the workout: sets that weren't ticked are dropped. A workout with no
 * done sets is deleted instead. Returns whether anything was saved.
 */
export async function finishWorkout(workoutId: number): Promise<boolean> {
  return db.transaction('rw', [db.workouts, db.sets], async () => {
    await db.sets.where('workoutId').equals(workoutId).filter((s) => !s.done).delete()
    const left = await db.sets.where('workoutId').equals(workoutId).count()
    if (left === 0) {
      await db.workouts.delete(workoutId)
      return false
    }
    await db.workouts.update(workoutId, { finishedAt: Date.now() })
    return true
  })
}

export async function discardWorkout(workoutId: number): Promise<void> {
  await db.transaction('rw', [db.workouts, db.sets], async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}

/** Deletes a finished workout from history. */
export const deleteWorkout = discardWorkout

/**
 * Starts a new workout with the same exercises as a past one: from its template
 * if that still exists, otherwise a free workout with the same exercises in the
 * same order and the same number of sets (prefilled from the last time).
 * Returns the new workout id, or undefined if the source workout is gone.
 */
export async function repeatWorkout(workoutId: number): Promise<number | undefined> {
  const source = await db.workouts.get(workoutId)
  if (!source) return undefined
  if (source.templateId !== undefined && (await db.templates.get(source.templateId))) return startWorkout(source.templateId)

  const sets = (await db.sets.where('workoutId').equals(workoutId).toArray()).filter((s) => s.done)
  const id = await startWorkout()
  for (const exerciseId of doneExerciseOrder(sets)) {
    await addExercise(id, exerciseId)
    const want = sets.filter((s) => s.exerciseId === exerciseId).length
    const have = await db.sets.where('[workoutId+exerciseId]').equals([id, exerciseId]).sortBy('setIndex')
    for (let i = have.length; i < want; i++) await addSet(id, exerciseId)
    for (const extra of have.slice(want).reverse()) await removeSet(extra.id!)
  }
  return id
}
