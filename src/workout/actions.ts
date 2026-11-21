import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import { lastPerformance } from '../data/queries.ts'
import type { WorkoutSet } from '../data/types.ts'

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

/** Planned sets for an exercise, prefilled from the last time it was done. */
async function plannedSets(workoutId: number, exerciseId: number, count: number, repMin?: number): Promise<WorkoutSet[]> {
  const last = await lastPerformance(exerciseId, workoutId)
  const lastSets = last?.sets.filter((s) => s.done) ?? []
  return Array.from({ length: count }, (_, i) => {
    const ref = lastSets[i] ?? lastSets.at(-1)
    return {
      workoutId,
      exerciseId,
      setIndex: i,
      weight: ref?.weight ?? 0,
      reps: ref?.reps ?? repMin ?? DEFAULT_REPS,
      done: false,
    }
  })
}

/** Starts a workout, optionally from a template. Returns the new workout id. */
export async function startWorkout(templateId?: number): Promise<number> {
  return db.transaction('rw', [db.workouts, db.sets, db.templates], async () => {
    const workoutId = (await db.workouts.add({ date: toIsoDate(), templateId, startedAt: Date.now() })) as number
    if (templateId !== undefined) {
      const template = await db.templates.get(templateId)
      for (const item of template?.items ?? []) {
        await db.sets.bulkAdd(await plannedSets(workoutId, item.exerciseId, item.targetSets, item.repMin))
      }
    }
    return workoutId
  })
}

export async function addExercise(workoutId: number, exerciseId: number): Promise<void> {
  const existing = await db.sets.where('[workoutId+exerciseId]').equals([workoutId, exerciseId]).count()
  if (existing > 0) return
  await db.sets.bulkAdd(await plannedSets(workoutId, exerciseId, DEFAULT_SETS))
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
