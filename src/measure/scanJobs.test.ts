import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db.ts'
import { resetDb } from '../data/testUtils.ts'
import { parseInbodyText } from '../ocr/parse.ts'
import CLEAN from '../ocr/__fixtures__/inbody-2026-11-01.txt?raw'

const gemini = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }))
vi.mock('../ocr/preprocess.ts', () => ({ prepareForAi: async (b: Blob) => b }))
vi.mock('../ocr/gemini.ts', () => ({
  recognizeWithGemini: () => gemini.impl!(),
  describeGeminiError: (e: unknown) => String(e),
}))
vi.mock('../ocr/engine.ts', () => ({
  recognizeInbody: async () => ({ text: '', parsed: parseInbodyText(CLEAN) }),
}))

const { completeScan, discardScan, resumePendingScans, startScan } = await import('./scanJobs.ts')

const doc = { visibilityState: 'visible' as 'visible' | 'hidden' }
vi.stubGlobal('document', doc)
vi.stubGlobal('navigator', { onLine: true })

const photo = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
const until = async (cond: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('timeout')
}

beforeEach(async () => {
  await resetDb()
  await db.settings.put({ id: 'main', goalWeight: 83, weeklySetTarget: { min: 10, max: 20 }, theme: 'system', restSeconds: 120, aiKey: 'KEY' })
  doc.visibilityState = 'visible'
})

describe('background scans', () => {
  it('stores the photo first and saves the Gemini result into the draft', async () => {
    gemini.impl = async () => ({ parsed: parseInbodyText(CLEAN), model: 'gemini-3.8-flash' })
    const id = await startScan(photo())
    expect((await db.drafts.get(id))?.status).toBe('processing')
    await until(async () => (await db.drafts.get(id))?.status === 'done')
    const d = (await db.drafts.get(id))!
    expect(d.result?.values.weight).toBe('77.4')
    expect(d.result?.source).toBe('Gemini (gemini-3.8-flash)')
    expect(await db.photos.get(d.photoId)).toBeDefined()
  })

  it('keeps a scan interrupted by leaving the app and finishes it on resume', async () => {
    gemini.impl = async () => {
      doc.visibilityState = 'hidden'
      throw new TypeError('Load failed')
    }
    const id = await startScan(photo())
    await until(async () => !(await db.drafts.get(id)) || doc.visibilityState === 'hidden')
    await new Promise((r) => setTimeout(r, 50))
    expect((await db.drafts.get(id))?.status).toBe('processing')
    expect((await db.drafts.get(id))?.attempts).toBe(0)

    doc.visibilityState = 'visible'
    gemini.impl = async () => ({ parsed: parseInbodyText(CLEAN), model: 'gemini-3.8-flash' })
    await resumePendingScans()
    await until(async () => (await db.drafts.get(id))?.status === 'done')
  })

  it('falls back to on-device recognition when Gemini fails in the foreground', async () => {
    gemini.impl = async () => {
      throw new Error('quota')
    }
    const id = await startScan(photo())
    await until(async () => (await db.drafts.get(id))?.status === 'done')
    const d = (await db.drafts.get(id))!
    expect(d.result?.source).toBe('Звичайне розпізнавання')
    expect(d.result?.note).toContain('Використано звичайне розпізнавання')
  })

  it('discard and complete both remove the draft and its photo', async () => {
    gemini.impl = async () => ({ parsed: parseInbodyText(CLEAN), model: 'm' })
    const a = await startScan(photo())
    const b = await startScan(photo())
    await until(async () => (await db.drafts.where('status').equals('done').count()) === 2)
    const pa = (await db.drafts.get(a))!.photoId
    const pb = (await db.drafts.get(b))!.photoId
    await discardScan(a)
    await completeScan(b)
    expect(await db.drafts.count()).toBe(0)
    expect(await db.photos.get(pa)).toBeUndefined()
    expect(await db.photos.get(pb)).toBeUndefined()
  })
})

describe('cleanupPhotos', () => {
  it('keeps only photos of pending drafts and unlinks scans', async () => {
    const { cleanupPhotos } = await import('./scanJobs.ts')
    const old = (await db.photos.add({ blob: photo(), createdAt: 1 })) as number
    const pending = (await db.photos.add({ blob: photo(), createdAt: 2 })) as number
    await db.drafts.add({ photoId: pending, createdAt: 2, status: 'error', attempts: 3 })
    await db.inbodyScans.add({ date: '2026-11-01', weight: 77.4, muscle: 41.4, fatKg: 5.6, pbf: 7.2, lean: { ra: null, la: null, tr: null, rl: null, ll: null }, fat: { ra: null, la: null, tr: null, rl: null, ll: null }, photoId: old, createdAt: 1 })
    await cleanupPhotos()
    expect(await db.photos.get(old)).toBeUndefined()
    expect(await db.photos.get(pending)).toBeDefined()
    expect((await db.inbodyScans.toArray())[0].photoId).toBeUndefined()
  })
})
