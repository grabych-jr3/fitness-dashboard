import { isForbiddenExercise } from '../data/seed.ts'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup, type Template, type TemplateItem } from '../data/types.ts'

/* Pure helpers for the template and exercise editors (no Dexie, no React). */

export const SETS_MIN = 1
export const SETS_MAX = 10
export const REPS_MIN = 1
export const REPS_MAX = 50

export const DEFAULT_ITEM: Omit<TemplateItem, 'exerciseId'> = { targetSets: 3, repMin: 8, repMax: 12 }

/** Returns a copy of `list` with the element at `index` moved by `delta` places (clamped to the ends). */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const out = [...list]
  if (index < 0 || index >= out.length) return out
  const to = Math.min(out.length - 1, Math.max(0, index + delta))
  if (to === index) return out
  const [item] = out.splice(index, 1)
  out.splice(to, 0, item)
  return out
}

export type GroupRole = 'none' | 'primary' | 'secondary'

export interface GroupSelection {
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
}

export function groupRole(sel: GroupSelection, g: MuscleGroup): GroupRole {
  if (sel.primary.includes(g)) return 'primary'
  if (sel.secondary.includes(g)) return 'secondary'
  return 'none'
}

/** Keeps groups unique and in the canonical `MUSCLE_GROUPS` order. */
function canonical(groups: readonly MuscleGroup[]): MuscleGroup[] {
  return MUSCLE_GROUPS.filter((g) => groups.includes(g))
}

/** Chip tap: none → основна → допоміжна → none. A group is never in both lists. */
export function cycleGroup(sel: GroupSelection, g: MuscleGroup): GroupSelection {
  const role = groupRole(sel, g)
  const primary = sel.primary.filter((x) => x !== g)
  const secondary = sel.secondary.filter((x) => x !== g)
  if (role === 'none') primary.push(g)
  else if (role === 'primary') secondary.push(g)
  return { primary: canonical(primary), secondary: canonical(secondary) }
}

export interface ExerciseDraft extends GroupSelection {
  name: string
}

/** Collapses inner whitespace and trims. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

/** Returns an error message (Ukrainian) or null when the exercise can be saved. */
export function validateExercise(draft: ExerciseDraft, existing: readonly Exercise[], selfId?: number): string | null {
  const name = cleanName(draft.name)
  if (name.length < 2) return 'Введи назву вправи.'
  if (name.length > 80) return 'Назва задовга (до 80 символів).'
  const lower = name.toLocaleLowerCase('uk')
  if (existing.some((e) => e.id !== selfId && cleanName(e.name).toLocaleLowerCase('uk') === lower)) return 'Вправа з такою назвою вже є.'
  if (draft.primary.length === 0) return 'Обери хоча б одну основну групу м’язів.'
  if (draft.primary.some((g) => draft.secondary.includes(g))) return 'Група не може бути одночасно основною і допоміжною.'
  return null
}

/** Soft warning for movements the owner should avoid (lower back / knees). */
export function exerciseWarning(name: string): string | null {
  return isForbiddenExercise(cleanName(name)) ? 'Схоже на вправу, яка навантажує поперек або коліна. Можна зберегти, але будь обережний.' : null
}

/** Normalised exercise ready for `db.exercises`. */
export function toExercise(draft: ExerciseDraft, archived = false): Omit<Exercise, 'id'> {
  return { name: cleanName(draft.name), primary: canonical(draft.primary), secondary: canonical(draft.secondary), archived }
}

export function validateTemplateName(name: string, templates: readonly Template[], selfId?: number): string | null {
  const n = cleanName(name)
  if (n.length < 1) return 'Введи назву шаблону.'
  if (n.length > 40) return 'Назва задовга (до 40 символів).'
  const lower = n.toLocaleLowerCase('uk')
  if (templates.some((t) => t.id !== selfId && cleanName(t.name).toLocaleLowerCase('uk') === lower)) return 'Шаблон з такою назвою вже є.'
  return null
}

/** First free «Новий шаблон», «Новий шаблон 2», … */
export function suggestTemplateName(templates: readonly Template[]): string {
  const taken = new Set(templates.map((t) => cleanName(t.name).toLocaleLowerCase('uk')))
  for (let i = 1; ; i++) {
    const name = i === 1 ? 'Новий шаблон' : `Новий шаблон ${i}`
    if (!taken.has(name.toLocaleLowerCase('uk'))) return name
  }
}

const clampInt = (v: number, min: number, max: number, fallback: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

/**
 * Applies a patch to a template item and keeps it valid: sets 1–10, reps 1–50,
 * repMin ≤ repMax (the field that was not edited moves to keep the range valid).
 */
export function patchItem(item: TemplateItem, patch: Partial<Omit<TemplateItem, 'exerciseId'>>): TemplateItem {
  const targetSets = clampInt(patch.targetSets ?? item.targetSets, SETS_MIN, SETS_MAX, item.targetSets)
  let repMin = clampInt(patch.repMin ?? item.repMin, REPS_MIN, REPS_MAX, item.repMin)
  let repMax = clampInt(patch.repMax ?? item.repMax, REPS_MIN, REPS_MAX, item.repMax)
  if (repMin > repMax) {
    if (patch.repMax !== undefined && patch.repMin === undefined) repMin = repMax
    else repMax = repMin
  }
  return { ...item, targetSets, repMin, repMax }
}

/** Parses a number typed on the iPhone keypad ("12", "12,0"); NaN when empty or invalid. */
export function parseIntInput(text: string): number {
  const t = text.trim().replace(',', '.')
  if (t === '') return NaN
  return Number(t)
}
