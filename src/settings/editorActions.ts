import { db } from '../data/db.ts'
import type { Exercise, TemplateItem } from '../data/types.ts'
import { DEFAULT_ITEM, cleanName, moveItem, patchItem, toExercise, validateExercise, validateTemplateName, type ExerciseDraft } from './editorLogic.ts'

/* Dexie writes for the template and exercise editors. Validation errors are thrown as EditorError. */

export class EditorError extends Error {}

/** Creates an empty template at the end of the list. Returns its id. */
export async function createTemplate(name: string): Promise<number> {
  return db.transaction('rw', db.templates, async () => {
    const all = await db.templates.toArray()
    const err = validateTemplateName(name, all)
    if (err) throw new EditorError(err)
    const order = all.reduce((m, t) => Math.max(m, t.order), -1) + 1
    return (await db.templates.add({ name: cleanName(name), items: [], order })) as number
  })
}

export async function renameTemplate(id: number, name: string): Promise<void> {
  await db.transaction('rw', db.templates, async () => {
    const err = validateTemplateName(name, await db.templates.toArray(), id)
    if (err) throw new EditorError(err)
    await db.templates.update(id, { name: cleanName(name) })
  })
}

/**
 * Deletes a template. Past workouts keep their `templateId`; the workout screens
 * fall back to «Вільне тренування» when the template is gone.
 */
export async function deleteTemplate(id: number): Promise<void> {
  await db.templates.delete(id)
}

async function editItems(id: number, fn: (items: TemplateItem[]) => TemplateItem[]): Promise<void> {
  await db.transaction('rw', db.templates, async () => {
    const t = await db.templates.get(id)
    if (!t) return
    await db.templates.update(id, { items: fn(t.items) })
  })
}

/** Appends an exercise (ignored if it is already in the template). */
export function addTemplateItem(id: number, exerciseId: number): Promise<void> {
  return editItems(id, (items) => (items.some((i) => i.exerciseId === exerciseId) ? items : [...items, { exerciseId, ...DEFAULT_ITEM }]))
}

export function removeTemplateItem(id: number, exerciseId: number): Promise<void> {
  return editItems(id, (items) => items.filter((i) => i.exerciseId !== exerciseId))
}

export function moveTemplateItem(id: number, exerciseId: number, delta: number): Promise<void> {
  return editItems(id, (items) => moveItem(items, items.findIndex((i) => i.exerciseId === exerciseId), delta))
}

export function updateTemplateItem(id: number, exerciseId: number, patch: Partial<Omit<TemplateItem, 'exerciseId'>>): Promise<void> {
  return editItems(id, (items) => items.map((i) => (i.exerciseId === exerciseId ? patchItem(i, patch) : i)))
}

/** Creates (no id) or updates an exercise. Returns its id. */
export async function saveExercise(draft: ExerciseDraft, id?: number): Promise<number> {
  return db.transaction('rw', db.exercises, async () => {
    const all = await db.exercises.toArray()
    const err = validateExercise(draft, all, id)
    if (err) throw new EditorError(err)
    if (id === undefined) return (await db.exercises.add(toExercise(draft) as Exercise)) as number
    const current = all.find((e) => e.id === id)
    if (!current) throw new EditorError('Вправу не знайдено.')
    const next = toExercise(draft, current.archived)
    await db.exercises.update(id, { name: next.name, primary: next.primary, secondary: next.secondary })
    return id
  })
}

export async function setExerciseArchived(id: number, archived: boolean): Promise<void> {
  await db.exercises.update(id, { archived })
}
