import { db } from './db'
import type { Exercise, InbodyScan, MuscleGroup, Settings, Template, TemplateItem } from './types'

export const muscleGroupLabels: Record<MuscleGroup, string> = {
  chest: 'Груди',
  back: 'Спина',
  shoulders: 'Плечі',
  biceps: 'Біцепс',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Біцепс стегна',
  glutes: 'Сідниці',
  calves: 'Литки',
  core: 'Прес / кор',
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  goalWeight: 83,
  weeklySetTarget: { min: 10, max: 20 },
  theme: 'system',
  restSeconds: 120,
}

/**
 * Movements the owner must not be offered (lower back / knee pain):
 * squats, Romanian (and other) deadlifts, lunges, any horizontal rows.
 */
export const FORBIDDEN_EXERCISE_PATTERNS: readonly RegExp[] = [
  /присід/i,
  /румун/i,
  /станов\S* тяг/i,
  /мертв/i,
  /випад/i,
  /болгар/i,
  /горизонт/i,
  /тяга .*(в нахилі|у нахилі|до пояса|гантел|штанг|т-гриф|сидячи|нижнього блока)/i,
]

export function isForbiddenExercise(name: string): boolean {
  return FORBIDDEN_EXERCISE_PATTERNS.some((re) => re.test(name))
}

type Kind = 'compound' | 'isolation'

interface SeedExercise {
  name: string
  kind: Kind
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
}

export const SEED_EXERCISES: readonly SeedExercise[] = [
  // Chest
  { name: 'Жим лежачи', kind: 'compound', primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  { name: 'Жим гантелей на похилій лаві', kind: 'compound', primary: ['chest'], secondary: ['shoulders', 'triceps'] },
  { name: 'Віджимання на брусах', kind: 'compound', primary: ['chest', 'triceps'], secondary: ['shoulders'] },
  { name: 'Зведення рук у тренажері (батерфляй)', kind: 'isolation', primary: ['chest'], secondary: [] },
  // Back (vertical pulls only)
  { name: 'Тяга верхнього блока широким хватом', kind: 'compound', primary: ['back'], secondary: ['biceps'] },
  { name: 'Тяга верхнього блока вузьким хватом', kind: 'compound', primary: ['back'], secondary: ['biceps'] },
  { name: 'Підтягування', kind: 'compound', primary: ['back'], secondary: ['biceps', 'core'] },
  { name: 'Пуловер на блоці', kind: 'isolation', primary: ['back'], secondary: ['triceps'] },
  // Shoulders
  { name: 'Жим гантелей над головою сидячи', kind: 'compound', primary: ['shoulders'], secondary: ['triceps'] },
  { name: 'Махи гантелями в сторони', kind: 'isolation', primary: ['shoulders'], secondary: [] },
  { name: 'Зворотні розведення в тренажері', kind: 'isolation', primary: ['shoulders'], secondary: ['back'] },
  // Legs
  { name: 'Жим ногами', kind: 'compound', primary: ['quads'], secondary: ['glutes', 'hamstrings'] },
  { name: 'Жим ногами (вузька постановка)', kind: 'compound', primary: ['quads'], secondary: ['glutes'] },
  { name: 'Розгинання ніг', kind: 'isolation', primary: ['quads'], secondary: [] },
  { name: 'Згинання ніг сидячи', kind: 'isolation', primary: ['hamstrings'], secondary: [] },
  { name: 'Згинання ніг лежачи', kind: 'isolation', primary: ['hamstrings'], secondary: ['calves'] },
  { name: 'Підйом на носки стоячи', kind: 'isolation', primary: ['calves'], secondary: [] },
  // Arms
  { name: 'Згинання на біцепс зі штангою', kind: 'isolation', primary: ['biceps'], secondary: [] },
  { name: 'Згинання на біцепс на похилій лаві', kind: 'isolation', primary: ['biceps'], secondary: [] },
  { name: 'Молотки', kind: 'isolation', primary: ['biceps'], secondary: [] },
  { name: 'Розгинання на трицепс на блоці', kind: 'isolation', primary: ['triceps'], secondary: [] },
  // Core
  { name: 'Скручування на блоці', kind: 'isolation', primary: ['core'], secondary: [] },
]

export const REP_RANGES: Record<Kind, { repMin: number; repMax: number }> = {
  compound: { repMin: 6, repMax: 12 },
  isolation: { repMin: 10, repMax: 15 },
}

export const SEED_SETS_PER_EXERCISE = 3

/** Full-body A/B/C: 6 exercises each, every major group hit at least once a week. */
export const SEED_TEMPLATES: readonly { name: string; exercises: readonly string[] }[] = [
  {
    name: 'Full body A',
    exercises: [
      'Жим лежачи',
      'Тяга верхнього блока широким хватом',
      'Жим ногами',
      'Згинання ніг сидячи',
      'Махи гантелями в сторони',
      'Згинання на біцепс зі штангою',
    ],
  },
  {
    name: 'Full body B',
    exercises: [
      'Жим гантелей над головою сидячи',
      'Підтягування',
      'Розгинання ніг',
      'Згинання ніг лежачи',
      'Підйом на носки стоячи',
      'Розгинання на трицепс на блоці',
    ],
  },
  {
    name: 'Full body C',
    exercises: [
      'Жим гантелей на похилій лаві',
      'Тяга верхнього блока вузьким хватом',
      'Жим ногами (вузька постановка)',
      'Зворотні розведення в тренажері',
      'Віджимання на брусах',
      'Молотки',
    ],
  },
]

/** The owner's first InBody scan (01.11.2026), entered by hand before OCR existed. */
export const FIRST_SCAN: Omit<InbodyScan, 'id' | 'createdAt'> = {
  date: '2026-11-01',
  weight: 77.4,
  muscle: 41.4,
  fatKg: 5.6,
  pbf: 7.2,
  tbw: 52.8,
  ffm: 71.8,
  bmi: 21.0,
  whr: 0.89,
  visceral: 1,
  bmr: 1921,
  fitnessScore: 79,
  lean: { ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 },
  fat: { ra: 0.1, la: 0.1, tr: 2.1, rl: 1.1, ll: 1.1 },
}

/**
 * Seeds a fresh database. The presence of the `settings` row marks the DB as
 * initialised, so deleting seeded rows later (or importing a backup) never
 * brings them back. Safe to call on every launch and concurrently.
 *
 * @returns true if seeding happened.
 */
export async function seedIfEmpty(): Promise<boolean> {
  return db.transaction('rw', [db.settings, db.exercises, db.templates, db.inbodyScans], async () => {
    if (await db.settings.get('main')) return false

    if ((await db.exercises.count()) === 0) {
      const toAdd: Exercise[] = SEED_EXERCISES.map(({ name, primary, secondary }) => ({
        name,
        primary: [...primary],
        secondary: [...secondary],
        archived: false,
      }))
      // auto-increment keys are always numbers once added
      const ids = await db.exercises.bulkAdd(toAdd, { allKeys: true })
      const byName = new Map<string, { id: number; kind: Kind }>()
      SEED_EXERCISES.forEach((ex, i) => byName.set(ex.name, { id: ids[i] as number, kind: ex.kind }))

      if ((await db.templates.count()) === 0) {
        const templates: Template[] = SEED_TEMPLATES.map((t, order) => ({
          name: t.name,
          order,
          items: t.exercises.map((exName): TemplateItem => {
            const ex = byName.get(exName)
            if (!ex) throw new Error(`Seed template "${t.name}" references unknown exercise "${exName}"`)
            return { exerciseId: ex.id, targetSets: SEED_SETS_PER_EXERCISE, ...REP_RANGES[ex.kind] }
          }),
        }))
        await db.templates.bulkAdd(templates)
      }
    }

    if ((await db.inbodyScans.where('date').equals(FIRST_SCAN.date).count()) === 0) {
      await db.inbodyScans.add({ ...structuredClone(FIRST_SCAN), createdAt: Date.now() })
    }

    await db.settings.put(structuredClone(DEFAULT_SETTINGS))
    return true
  })
}
