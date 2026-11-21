/*
 * Background receipt recognition.
 *
 * A scan is saved as a draft (photo + status) in IndexedDB before any recognition
 * starts, and runs outside of any screen. Switching tabs doesn't stop it; if iOS
 * suspends or kills the app mid-request, the draft stays "processing" and is
 * restarted when the app comes back. The result waits in the draft until the user
 * reviews and saves it.
 */
import { useSyncExternalStore } from 'react'
import { db } from '../data/db.ts'
import { toIsoDate } from '../data/dates.ts'
import type { ScanDraft } from '../data/types.ts'
import { valuesFromParsed } from './scanForm.ts'

export type ScanStage = 'ai' | 'preprocess' | 'load' | 'recognize' | 'parse' | 'done'
type Progress = { p: number; stage: ScanStage }

const MAX_ATTEMPTS = 3
const running = new Set<number>()
const progress = new Map<number, Progress>()
const listeners = new Set<() => void>()
let snapshot = new Map(progress)

function emit() {
  snapshot = new Map(progress)
  listeners.forEach((l) => l())
}
function setProgress(id: number, p: Progress | null) {
  if (p) progress.set(id, p)
  else progress.delete(id)
  emit()
}

/** Live progress of running scans (only for this app session). */
export function useScanProgress(): Map<number, Progress> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}

/** Stores the photo and a draft, then recognises it in the background. Returns the draft id. */
export async function startScan(file: Blob): Promise<number> {
  const id = await db.transaction('rw', [db.photos, db.drafts], async () => {
    const photoId = (await db.photos.add({ blob: file, createdAt: Date.now() })) as number
    return (await db.drafts.add({ photoId, createdAt: Date.now(), status: 'processing', attempts: 0 })) as number
  })
  void run(id)
  return id
}

/** Restarts drafts that were interrupted (app suspended/closed mid-request). */
export async function resumePendingScans(): Promise<void> {
  const pending = await db.drafts.where('status').equals('processing').toArray()
  for (const d of pending) if (d.id !== undefined && !running.has(d.id)) void run(d.id)
}

export async function retryScan(id: number): Promise<void> {
  await db.drafts.update(id, { status: 'processing', error: undefined, attempts: 0 })
  void run(id)
}

/** Removes a draft and its photo (the photo is kept if a saved scan uses it). */
export async function discardScan(id: number): Promise<void> {
  await db.transaction('rw', [db.drafts, db.photos, db.inbodyScans], async () => {
    const d = await db.drafts.get(id)
    await db.drafts.delete(id)
    if (d && (await db.inbodyScans.filter((s) => s.photoId === d.photoId).count()) === 0) await db.photos.delete(d.photoId)
  })
  setProgress(id, null)
}

/** The draft became a saved scan: drop the draft, keep the photo. */
export async function completeScan(id: number): Promise<void> {
  await db.drafts.delete(id)
  setProgress(id, null)
}

const withTimeout = <T,>(p: Promise<T>, ms: number, controller?: AbortController) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      controller?.abort()
      reject(new Error('timeout'))
    }, ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })

async function run(id: number): Promise<void> {
  if (running.has(id)) return
  running.add(id)
  try {
    const draft = await db.drafts.get(id)
    if (!draft || draft.status !== 'processing') return
    if (draft.attempts >= MAX_ATTEMPTS) {
      await db.drafts.update(id, { status: 'error', error: 'Розпізнавання кілька разів переривалось. Спробуй ще раз або введи цифри вручну.' })
      return
    }
    await db.drafts.update(id, { attempts: draft.attempts + 1 })
    const photo = await db.photos.get(draft.photoId)
    if (!photo) {
      await db.drafts.update(id, { status: 'error', error: 'Фото не знайдено.' })
      return
    }
    const settings = await db.settings.get('main')
    const result = await recognize(id, photo.blob, settings?.aiKey, settings?.aiModel)
    // Drafts may have been discarded meanwhile.
    if (await db.drafts.get(id)) await db.drafts.update(id, { status: 'done', result })
  } catch (e) {
    console.error(e)
    if ((e as { interrupted?: boolean }).interrupted) {
      // App went to the background mid-request: stay "processing", don't count the attempt;
      // resumePendingScans() picks it up when the app is visible again.
      const d = await db.drafts.get(id)
      if (d) await db.drafts.update(id, { attempts: Math.max(0, d.attempts - 1) })
      return
    }
    const step = (e as { step?: string }).step
    const text =
      step === 'photo'
        ? 'Не вдалося відкрити це фото.'
        : step === 'load'
          ? navigator.onLine
            ? 'Не вдалося завантажити модуль розпізнавання.'
            : 'Для першого розпізнавання потрібен інтернет (~7 МБ). Потім працює офлайн.'
          : 'Не вдалося розпізнати цифри на фото.'
    const detail = e instanceof Error ? e.message : String(e)
    if (await db.drafts.get(id)) await db.drafts.update(id, { status: 'error', error: `${text} (${detail})` })
  } finally {
    running.delete(id)
    setProgress(id, null)
  }
}

async function recognize(id: number, file: Blob, aiKey?: string, aiModel?: string): Promise<NonNullable<ScanDraft['result']>> {
  let note: string | undefined
  // 1. Gemini, when the user added a key and we're online.
  if (aiKey && navigator.onLine) {
    let ticker: ReturnType<typeof setInterval> | undefined
    try {
      const [{ prepareForAi }, gemini] = await Promise.all([import('../ocr/preprocess.ts'), import('../ocr/gemini.ts')])
      const image = await prepareForAi(file)
      let p = 0.12
      setProgress(id, { p, stage: 'ai' })
      // The API reports no progress; creep the bar so it doesn't look frozen.
      ticker = setInterval(() => setProgress(id, { p: (p = Math.min(0.93, p + (0.95 - p) * 0.07)), stage: 'ai' }), 400)
      const controller = new AbortController()
      const { parsed, model } = await withTimeout(gemini.recognizeWithGemini(image, aiKey, aiModel, controller.signal), 70_000, controller)
      return {
        values: valuesFromParsed(parsed, toIsoDate()),
        issues: parsed.issues,
        confidence: parsed.confidence,
        source: `Gemini (${model})`,
      }
    } catch (e) {
      console.error(e)
      // Leaving the app on iOS cuts the request: let the resume logic retry Gemini
      // instead of silently falling back to the weaker on-device reader.
      if (document.visibilityState === 'hidden') throw Object.assign(new Error('interrupted'), { interrupted: true })
      const { describeGeminiError } = await import('../ocr/gemini.ts')
      note = `${e instanceof Error && e.message === 'timeout' ? 'Gemini не відповів вчасно.' : describeGeminiError(e)} Використано звичайне розпізнавання.`
    } finally {
      if (ticker) clearInterval(ticker)
    }
  }
  // 2. On-device Tesseract (no key, offline, or Gemini failed).
  setProgress(id, { p: 0, stage: 'preprocess' })
  const { recognizeInbody } = await import('../ocr/engine.ts')
  const { parsed } = await recognizeInbody(file, (p, stage) => setProgress(id, { p, stage }))
  return {
    values: valuesFromParsed(parsed, toIsoDate()),
    issues: parsed.issues,
    confidence: parsed.confidence,
    source: aiKey ? 'Звичайне розпізнавання' : undefined,
    note: note ?? (aiKey ? undefined : 'Порада: додай ключ Gemini в Налаштуваннях — він читає термочек значно точніше.'),
  }
}

/** Wires automatic resume: at start-up and whenever the app becomes visible again. */
export function initScanJobs() {
  void resumePendingScans()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resumePendingScans()
  })
  window.addEventListener('online', () => void resumePendingScans())
}
