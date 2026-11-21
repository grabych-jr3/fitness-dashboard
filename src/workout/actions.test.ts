import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db.ts'
import { seedIfEmpty } from '../data/seed.ts'
import { resetDb } from '../data/testUtils.ts'
import { addExercise, addSet, exerciseOrder, finishWorkout, removeSet, repeatWorkout, startWorkout, toggleDone, updateSet } from './actions.ts'

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

  it('prefills the double-progression target from the last finished workout', async () => {
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
    // working set = the top weight (62.5 × 8), inside the range -> same weight, +1 rep
    expect(next.map((s) => [s.weight, s.reps])).toEqual([
      [62.5, 9],
      [62.5, 9],
      [62.5, 9],
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

  it('repeats a template workout from its template', async () => {
    const t = await templateA()
    const first = await startWorkout(t.id)
    const s0 = (await db.sets.where('workoutId').equals(first).sortBy('setIndex'))[0]
    await updateSet(s0.id!, { weight: 50, reps: 8 })
    await toggleDone(s0.id!)
    await finishWorkout(first)

    const id = (await repeatWorkout(first))!
    const w = await db.workouts.get(id)
    expect(w).toMatchObject({ templateId: t.id })
    expect(w!.finishedAt).toBeUndefined()
    const sets = await db.sets.where('workoutId').equals(id).toArray()
    expect(exerciseOrder(sets)).toEqual(t.items.map((i) => i.exerciseId))
    expect(sets).toHaveLength(t.items.reduce((n, i) => n + i.targetSets, 0))
  })

  it('repeats a free workout (or one whose template was deleted) with the same exercises, order and set count', async () => {
    const all = await db.exercises.toArray()
    const [a, b] = [all[4], all[1]]
    const first = await startWorkout()
    await addExercise(first, a.id!)
    await addExercise(first, b.id!)
    await addSet(first, a.id!) // a: 4 sets
    const sets = await db.sets.where('workoutId').equals(first).toArray()
    for (const s of sets) {
      if (s.exerciseId === b.id && s.setIndex > 0) continue // b: only 1 done set
      await updateSet(s.id!, { weight: 30, reps: 10 })
      await toggleDone(s.id!)
    }
    await finishWorkout(first)

    const id = (await repeatWorkout(first))!
    expect(id).not.toBe(first)
    const next = await db.sets.where('workoutId').equals(id).toArray()
    expect((await db.workouts.get(id))!.templateId).toBeUndefined()
    expect(exerciseOrder(next)).toEqual([a.id, b.id])
    expect(next.filter((s) => s.exerciseId === a.id)).toHaveLength(4)
    expect(next.filter((s) => s.exerciseId === b.id)).toHaveLength(1)
    expect(next.every((s) => !s.done && s.weight === 30 && s.reps === 11)).toBe(true) // +1 rep (double progression)

    // template deleted -> falls back to the free path
    const t = await templateA()
    const third = await startWorkout(t.id)
    const s0 = (await db.sets.where('workoutId').equals(third).sortBy('id'))[0]
    await toggleDone(s0.id!)
    await finishWorkout(third)
    await db.templates.delete(t.id!)
    const again = (await repeatWorkout(third))!
    expect((await db.workouts.get(again))!.templateId).toBeUndefined()
    expect(exerciseOrder(await db.sets.where('workoutId').equals(again).toArray())).toEqual([s0.exerciseId])
  })

  it('returns undefined when repeating a missing workout', async () => {
    expect(await repeatWorkout(9999)).toBeUndefined()
  })
})

describe('progression from the database', () => {
  it('uses the template range and step; summary after finishing', async () => {
    const { nextStepsAfter, planFor, defaultWeightStep } = await import('../data/queries.ts')
    expect(defaultWeightStep('Жим гантелей на похилій лаві')).toBe(2)
    expect(defaultWeightStep('Жим ногами')).toBe(5)
    const t = await templateA()
    const item = t.items[0]
    expect((await planFor(item.exerciseId, t.id)).range).toEqual({ repMin: item.repMin, repMax: item.repMax })

    const id = await startWorkout(t.id)
    const sets = await db.sets.where('[workoutId+exerciseId]').equals([id, item.exerciseId]).sortBy('setIndex')
    for (const s of sets) {
      await updateSet(s.id!, { weight: 50, reps: item.repMax })
      await toggleDone(s.id!)
    }
    await finishWorkout(id)
    const [step] = await nextStepsAfter(id)
    expect(step.rec.action).toBe('up-weight')
    expect(step.rec.weight).toBeGreaterThan(50)

    const next = await startWorkout(t.id)
    const planned = await db.sets.where('[workoutId+exerciseId]').equals([next, item.exerciseId]).toArray()
    expect(planned.every((s, i) => s.weight === step.rec.weight && s.reps === step.rec.reps[i] && s.reps >= item.repMin && s.reps < item.repMax)).toBe(true)
  })
})
