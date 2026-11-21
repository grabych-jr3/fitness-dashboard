import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db.ts'
import { seedIfEmpty } from '../data/seed.ts'
import { resetDb } from '../data/testUtils.ts'
import { addExercise, addSet, exerciseOrder, finishWorkout, removeSet, startWorkout, toggleDone, updateSet } from './actions.ts'

beforeEach(async () => {
  await resetDb()
  await seedIfEmpty()
})

async function templateA() {
  return (await db.templates.where('name').equals('Full body A').first())!
}

describe('workout actions', () => {
  it('starts a workout from a template with planned sets in template order', async () => {
    const t = await templateA()
    const id = await startWorkout(t.id)
    const sets = await db.sets.where('workoutId').equals(id).toArray()
    expect(sets).toHaveLength(t.items.reduce((n, i) => n + i.targetSets, 0))
    expect(exerciseOrder(sets)).toEqual(t.items.map((i) => i.exerciseId))
    expect(sets.every((s) => !s.done)).toBe(true)
  })

  it('prefills weights and reps from the last finished workout', async () => {
    const t = await templateA()
    const first = await startWorkout(t.id)
    const exId = t.items[0].exerciseId
    const sets = await db.sets.where('[workoutId+exerciseId]').equals([first, exId]).sortBy('setIndex')
    await updateSet(sets[0].id!, { weight: 60, reps: 10 })
    await updateSet(sets[1].id!, { weight: 62.5, reps: 8 })
    await toggleDone(sets[0].id!)
    await toggleDone(sets[1].id!)
    expect(await finishWorkout(first)).toBe(true)

    const second = await startWorkout(t.id)
    const next = await db.sets.where('[workoutId+exerciseId]').equals([second, exId]).sortBy('setIndex')
    expect(next.map((s) => [s.weight, s.reps])).toEqual([
      [60, 10],
      [62.5, 8],
      [62.5, 8],
    ])
  })

  it('drops unticked sets on finish and deletes an empty workout', async () => {
    const t = await templateA()
    const id = await startWorkout(t.id)
    expect(await finishWorkout(id)).toBe(false)
    expect(await db.workouts.get(id)).toBeUndefined()
    expect(await db.sets.where('workoutId').equals(id).count()).toBe(0)
  })

  it('adds sets copying the previous one and renumbers after removal', async () => {
    const id = await startWorkout()
    const ex = (await db.exercises.toArray())[0]
    await addExercise(id, ex.id!)
    await addExercise(id, ex.id!) // no duplicates
    let sets = await db.sets.where('workoutId').equals(id).sortBy('setIndex')
    expect(sets).toHaveLength(3)
    await updateSet(sets[2].id!, { weight: 40, reps: 12 })
    await addSet(id, ex.id!)
    sets = await db.sets.where('workoutId').equals(id).sortBy('setIndex')
    expect(sets.at(-1)).toMatchObject({ setIndex: 3, weight: 40, reps: 12 })
    await removeSet(sets[0].id!)
    sets = await db.sets.where('workoutId').equals(id).sortBy('setIndex')
    expect(sets.map((s) => s.setIndex)).toEqual([0, 1, 2])
  })
})
