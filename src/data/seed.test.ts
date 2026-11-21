import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { DEFAULT_SETTINGS, FIRST_SCAN, isForbiddenExercise, REP_RANGES, SEED_EXERCISES, seedIfEmpty } from './seed'
import { resetDb } from './testUtils'

beforeEach(resetDb)

describe('seedIfEmpty', () => {
  it('seeds exercises, templates, settings and the first scan', async () => {
    expect(await seedIfEmpty()).toBe(true)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.templates.count()).toBe(3)
    expect(await db.settings.get('main')).toEqual(DEFAULT_SETTINGS)
    const scans = await db.inbodyScans.toArray()
    expect(scans).toHaveLength(1)
    expect(scans[0]).toMatchObject(FIRST_SCAN)
  })

  it('is idempotent, also when called concurrently', async () => {
    const results = await Promise.all([seedIfEmpty(), seedIfEmpty()])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await seedIfEmpty()).toBe(false)
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.templates.count()).toBe(3)
    expect(await db.inbodyScans.count()).toBe(1)
  })

  it('does not resurrect deleted seed data once initialised', async () => {
    await seedIfEmpty()
    await db.inbodyScans.clear()
    await db.templates.clear()
    expect(await seedIfEmpty()).toBe(false)
    expect(await db.inbodyScans.count()).toBe(0)
    expect(await db.templates.count()).toBe(0)
  })
})

describe('seed content', () => {
  it('has no forbidden movements (squats, RDL, lunges, horizontal rows)', async () => {
    await seedIfEmpty()
    const exercises = await db.exercises.toArray()
    for (const ex of exercises) expect(isForbiddenExercise(ex.name), ex.name).toBe(false)

    const byId = new Map(exercises.map((e) => [e.id, e]))
    for (const t of await db.templates.toArray()) {
      for (const item of t.items) {
        const ex = byId.get(item.exerciseId)
        expect(ex, `template ${t.name} references a missing exercise`).toBeDefined()
        expect(isForbiddenExercise(ex!.name), ex!.name).toBe(false)
      }
    }
  })

  it('forbidden-pattern check actually catches the forbidden movements', () => {
    for (const name of ['Присідання зі штангою', 'Румунська тяга', 'Випади з гантелями', 'Тяга штанги в нахилі', 'Горизонтальна тяга блока', 'Тяга гантелі однією рукою', 'Станова тяга']) {
      expect(isForbiddenExercise(name), name).toBe(true)
    }
  })

  it('templates A/B/C have 5–6 exercises, 3 sets each and correct rep ranges', async () => {
    await seedIfEmpty()
    const templates = await db.templates.orderBy('order').toArray()
    expect(templates.map((t) => t.name)).toEqual(['Full body A', 'Full body B', 'Full body C'])
    const exercises = await db.exercises.toArray()
    const kindByName = new Map(SEED_EXERCISES.map((e) => [e.name, e.kind]))
    for (const t of templates) {
      expect(t.items.length).toBeGreaterThanOrEqual(5)
      expect(t.items.length).toBeLessThanOrEqual(6)
      for (const item of t.items) {
        expect(item.targetSets).toBe(3)
        const name = exercises.find((e) => e.id === item.exerciseId)!.name
        const { repMin, repMax } = REP_RANGES[kindByName.get(name)!]
        expect([item.repMin, item.repMax]).toEqual([repMin, repMax])
      }
    }
  })

  it('every muscle group except core is trained by the templates', async () => {
    await seedIfEmpty()
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
    const covered = new Set<string>()
    for (const t of await db.templates.toArray())
      for (const item of t.items) exercises.get(item.exerciseId)!.primary.forEach((g) => covered.add(g))
    for (const g of ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'calves'])
      expect(covered.has(g), g).toBe(true)
  })
})
