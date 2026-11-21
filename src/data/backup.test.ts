import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BackupValidationError, blobToDataUrl, dataUrlToBlob, exportAll, importAll, requestPersistentStorage, validateBackup } from './backup'
import { db } from './db'
import { seedIfEmpty } from './seed'
import { resetDb } from './testUtils'

beforeEach(resetDb)

async function addWorkoutData(): Promise<void> {
  const exerciseId = (await db.exercises.toCollection().first())!.id!
  const workoutId = (await db.workouts.add({ date: '2026-11-20', startedAt: 1, finishedAt: 2, note: 'ок' })) as number
  await db.sets.bulkAdd([
    { workoutId, exerciseId, setIndex: 0, weight: 80, reps: 8, done: true, completedAt: 3 },
    { workoutId, exerciseId, setIndex: 1, weight: 80, reps: 7, done: true, pain: true },
  ])
  await db.weighIns.add({ date: '2026-11-21', weight: 78 })
}

describe('backup', () => {
  it('round-trips all tables through JSON (without photos)', async () => {
    await seedIfEmpty()
    await addWorkoutData()
    const before = await exportAll()
    const json = JSON.stringify(before)

    await resetDb()
    const counts = await importAll(json, { mode: 'replace' })
    expect(counts.sets).toBe(2)
    expect(counts.photos).toBe(0)

    const after = await exportAll()
    expect(after.tables).toEqual(before.tables)
    expect(after.schemaVersion).toBe(1)
  })

  it('replace mode removes data that is not in the backup', async () => {
    await seedIfEmpty()
    const backup = await exportAll()
    await addWorkoutData()
    await importAll(backup, { mode: 'replace' })
    expect(await db.sets.count()).toBe(0)
    expect(await db.weighIns.count()).toBe(0)
  })

  it('encodes photos as data URLs', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const url = await blobToDataUrl(new Blob([bytes], { type: 'image/jpeg' }))
    expect(url).toBe('data:image/jpeg;base64,AAEC+v8=')
    const back = dataUrlToBlob(url)
    expect(back.type).toBe('image/jpeg')
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes)
  })

  it('round-trips stored photos', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const photoId = (await db.photos.add({ blob: new Blob([bytes], { type: 'image/png' }), createdAt: 5 })) as number
    const backup = JSON.parse(JSON.stringify(await exportAll())) as unknown
    await resetDb()
    await importAll(backup, { mode: 'replace' })
    const photo = await db.photos.get(photoId)
    expect(photo?.createdAt).toBe(5)
    expect(photo?.blob.type).toBe('image/png')
    expect(new Uint8Array(await photo!.blob.arrayBuffer())).toEqual(bytes)
  })

  it('rejects invalid files without touching the db', async () => {
    await seedIfEmpty()
    const good = await exportAll()
    const exercises = await db.exercises.count()

    await expect(importAll('not json', { mode: 'replace' })).rejects.toBeInstanceOf(BackupValidationError)
    await expect(importAll({ ...good, app: 'other' }, { mode: 'replace' })).rejects.toThrow(/іншого застосунку/)
    await expect(importAll({ ...good, schemaVersion: 99 }, { mode: 'replace' })).rejects.toThrow(/новішою/)
    const broken = structuredClone(good)
    ;(broken.tables.inbodyScans[0] as unknown as Record<string, unknown>).date = '01.11.2026'
    await expect(importAll(broken, { mode: 'replace' })).rejects.toThrow(/inbodyScans/)
    expect(() => validateBackup({ ...good, tables: { ...good.tables, sets: undefined } })).toThrow(/sets/)

    expect(await db.exercises.count()).toBe(exercises)
  })

  it('requestPersistentStorage is safe without the Storage API', async () => {
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})
