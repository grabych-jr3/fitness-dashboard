import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db.ts'
import { seedIfEmpty } from '../data/seed.ts'
import { resetDb } from '../data/testUtils.ts'
import type { Exercise, Template, TemplateItem } from '../data/types.ts'
import { startWorkout, toggleDone, finishWorkout } from '../workout/actions.ts'
import {
  EditorError,
  addTemplateItem,
  createTemplate,
  deleteTemplate,
  moveTemplateItem,
  removeTemplateItem,
  renameTemplate,
  saveExercise,
  setExerciseArchived,
  updateTemplateItem,
} from './editorActions.ts'
import {
  cycleGroup,
  exerciseWarning,
  groupRole,
  moveItem,
  parseIntInput,
  patchItem,
  suggestTemplateName,
  toExercise,
  validateExercise,
  validateTemplateName,
} from './editorLogic.ts'

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })
  it('clamps at the ends and ignores bad indexes', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
  })
  it('does not mutate the input', () => {
    const list = ['a', 'b']
    moveItem(list, 0, 1)
    expect(list).toEqual(['a', 'b'])
  })
})

describe('cycleGroup', () => {
  it('cycles none → primary → secondary → none', () => {
    let s = { primary: [], secondary: [] } as Parameters<typeof cycleGroup>[0]
    s = cycleGroup(s, 'chest')
    expect(groupRole(s, 'chest')).toBe('primary')
    s = cycleGroup(s, 'chest')
    expect(s).toEqual({ primary: [], secondary: ['chest'] })
    s = cycleGroup(s, 'chest')
    expect(groupRole(s, 'chest')).toBe('none')
    expect(s).toEqual({ primary: [], secondary: [] })
  })
  it('keeps the canonical group order', () => {
    const s = cycleGroup({ primary: ['triceps'], secondary: [] }, 'chest')
    expect(s.primary).toEqual(['chest', 'triceps'])
  })
})

describe('validateExercise', () => {
  const existing: Exercise[] = [{ id: 1, name: 'Жим лежачи', primary: ['chest'], secondary: [], archived: false }]
  it('requires a name and a primary group', () => {
    expect(validateExercise({ name: ' ', primary: ['chest'], secondary: [] }, existing)).toMatch(/назву/)
    expect(validateExercise({ name: 'Кросовер', primary: [], secondary: ['chest'] }, existing)).toMatch(/основну/)
  })
  it('rejects duplicate names (case-insensitive) but not the exercise itself', () => {
    expect(validateExercise({ name: 'жим  ЛЕЖАЧИ', primary: ['chest'], secondary: [] }, existing)).toMatch(/вже є/)
    expect(validateExercise({ name: 'Жим лежачи', primary: ['chest'], secondary: ['triceps'] }, existing, 1)).toBeNull()
  })
  it('rejects a group in both lists', () => {
    expect(validateExercise({ name: 'Кросовер', primary: ['chest'], secondary: ['chest'] }, existing)).toMatch(/одночасно/)
  })
  it('accepts a valid draft and normalises it', () => {
    const d = { name: '  Кросовер   на блоці ', primary: ['chest' as const], secondary: ['triceps' as const, 'shoulders' as const] }
    expect(validateExercise(d, existing)).toBeNull()
    expect(toExercise(d)).toEqual({ name: 'Кросовер на блоці', primary: ['chest'], secondary: ['shoulders', 'triceps'], archived: false })
  })
  it('warns about movements that hurt the lower back or knees', () => {
    expect(exerciseWarning('Присідання зі штангою')).not.toBeNull()
    expect(exerciseWarning('Кросовер')).toBeNull()
  })
})

describe('template helpers', () => {
  const templates: Template[] = [{ id: 1, name: 'Новий шаблон', items: [], order: 0 }]
  it('validates names', () => {
    expect(validateTemplateName('', templates)).toMatch(/назву/)
    expect(validateTemplateName('новий шаблон', templates)).toMatch(/вже є/)
    expect(validateTemplateName('Новий шаблон', templates, 1)).toBeNull()
  })
  it('suggests a free name', () => {
    expect(suggestTemplateName([])).toBe('Новий шаблон')
    expect(suggestTemplateName(templates)).toBe('Новий шаблон 2')
  })
  it('patchItem clamps and keeps repMin ≤ repMax', () => {
    const item: TemplateItem = { exerciseId: 1, targetSets: 3, repMin: 8, repMax: 12 }
    expect(patchItem(item, { targetSets: 0 }).targetSets).toBe(1)
    expect(patchItem(item, { targetSets: 99 }).targetSets).toBe(10)
    expect(patchItem(item, { repMin: 15 })).toMatchObject({ repMin: 15, repMax: 15 })
    expect(patchItem(item, { repMax: 5 })).toMatchObject({ repMin: 5, repMax: 5 })
    expect(patchItem(item, { repMin: NaN })).toMatchObject({ repMin: 8 })
  })
  it('parseIntInput', () => {
    expect(parseIntInput(' 12 ')).toBe(12)
    expect(parseIntInput('7,0')).toBe(7)
    expect(parseIntInput('')).toBeNaN()
  })
})

describe('editor actions (Dexie)', () => {
  beforeEach(async () => {
    await resetDb()
    await seedIfEmpty()
  })

  const exId = async (name: string) => (await db.exercises.where('name').equals(name).first())!.id!

  it('creates, renames and fills a template', async () => {
    const id = await createTemplate('  Верх ')
    const t = (await db.templates.get(id))!
    expect(t).toMatchObject({ name: 'Верх', items: [], order: 3 })
    await expect(createTemplate('full body a')).rejects.toBeInstanceOf(EditorError)

    await renameTemplate(id, 'Верх тіла')
    await expect(renameTemplate(id, 'Full body B')).rejects.toThrow(/вже є/)

    const bench = await exId('Жим лежачи')
    const pull = await exId('Підтягування')
    const curl = await exId('Молотки')
    await addTemplateItem(id, bench)
    await addTemplateItem(id, pull)
    await addTemplateItem(id, curl)
    await addTemplateItem(id, bench) // duplicate ignored
    await moveTemplateItem(id, curl, -1)
    await updateTemplateItem(id, pull, { targetSets: 4, repMin: 6, repMax: 10 })
    await removeTemplateItem(id, bench)

    const after = (await db.templates.get(id))!
    expect(after.name).toBe('Верх тіла')
    expect(after.items).toEqual([
      { exerciseId: curl, targetSets: 3, repMin: 8, repMax: 12 },
      { exerciseId: pull, targetSets: 4, repMin: 6, repMax: 10 },
    ])
  })

  it('deleting a template keeps past workouts intact', async () => {
    const tA = (await db.templates.where('name').equals('Full body A').first())!
    const wId = await startWorkout(tA.id)
    const first = (await db.sets.where('workoutId').equals(wId).first())!
    await toggleDone(first.id!)
    await finishWorkout(wId)

    await deleteTemplate(tA.id!)
    expect(await db.templates.get(tA.id!)).toBeUndefined()
    const w = (await db.workouts.get(wId))!
    expect(w.templateId).toBe(tA.id)
    expect(await db.sets.where('workoutId').equals(wId).count()).toBe(1)
    // a new template does not reuse the deleted id
    const newId = await createTemplate('Новий')
    expect(newId).not.toBe(tA.id)
  })

  it('creates and edits exercises, including seeded ones', async () => {
    const id = await saveExercise({ name: 'Кросовер', primary: ['chest'], secondary: ['shoulders'] })
    expect(await db.exercises.get(id)).toMatchObject({ name: 'Кросовер', primary: ['chest'], secondary: ['shoulders'], archived: false })
    await expect(saveExercise({ name: 'Кросовер', primary: ['chest'], secondary: [] })).rejects.toThrow(/вже є/)
    await expect(saveExercise({ name: 'Без груп', primary: [], secondary: [] })).rejects.toThrow(/основну/)

    const bench = await exId('Жим лежачи')
    await setExerciseArchived(bench, true)
    await saveExercise({ name: 'Жим штанги лежачи', primary: ['chest', 'triceps'], secondary: ['shoulders'] }, bench)
    expect(await db.exercises.get(bench)).toMatchObject({
      name: 'Жим штанги лежачи',
      primary: ['chest', 'triceps'],
      secondary: ['shoulders'],
      archived: true,
    })
    await setExerciseArchived(bench, false)
    expect((await db.exercises.get(bench))!.archived).toBe(false)
  })
})
