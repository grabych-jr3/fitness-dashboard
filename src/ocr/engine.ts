import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { parseInbodyText } from './parse'
import { mergeParsed } from './merge'
import { prepareOcrPasses } from './preprocess'
import type { ParsedScan } from './types'

/*
 * Tesseract.js wrapper. All assets come from our own origin (see the
 * `tesseractAssets` plugin in vite.config.ts), so OCR works offline:
 *   tesseract/<versions>/worker.min.js             worker script
 *   tesseract/<versions>/core/*.wasm.js            wasm core (LSTM-only builds; the
 *                                                  worker picks relaxed-SIMD / SIMD / plain)
 *   tesseract/<versions>/lang/eng.traineddata.gz   English model (tessdata best_int)
 */

/** 'tesseract/<versions>/', injected by the tesseract-assets plugin in vite.config.ts. */
declare const __TESSERACT_DIR__: string

export type OcrStage = 'preprocess' | 'load' | 'recognize' | 'parse' | 'done'

export type OcrProgress = (progress: number, stage: OcrStage) => void

const assetUrl = (path: string) => new URL(`${import.meta.env.BASE_URL}${__TESSERACT_DIR__}${path}`, self.location.href).href

let workerPromise: Promise<Worker> | null = null
let progressListener: OcrProgress | undefined
/** Serialises jobs so progress callbacks never interleave. */
let queue: Promise<unknown> = Promise.resolve()
/** Share of the overall progress bar taken by the current recognition pass. */
let passSlice = { from: 0.3, size: 0.65 }

// Overall progress split: preprocess 0–0.1, load 0.1–0.3, recognize 0.3–0.95, parse → 1.
function onTesseractLog(m: { status: string; progress: number }) {
  if (!progressListener) return
  const p = Math.max(0, Math.min(1, m.progress || 0))
  if (m.status === 'recognizing text') progressListener(passSlice.from + passSlice.size * p, 'recognize')
  else progressListener(0.1 + 0.2 * p, 'load')
}

function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: assetUrl('worker.min.js'),
      corePath: assetUrl('core'),
      langPath: assetUrl('lang'),
      gzip: true,
      workerBlobURL: false,
      logger: onTesseractLog,
      errorHandler: () => {},
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    })
    return worker
  })().catch((err: unknown) => {
    workerPromise = null // allow a retry (e.g. after a failed first download)
    throw err
  })
  return workerPromise
}

async function run(file: Blob, onProgress?: OcrProgress): Promise<{ text: string; parsed: ParsedScan }> {
  progressListener = onProgress
  try {
    onProgress?.(0, 'preprocess')
    const canvases = await prepareOcrPasses(file)
    onProgress?.(0.1, 'load')
    const worker = await getWorker()
    const texts: string[] = []
    const passes: ParsedScan[] = []
    for (const [i, canvas] of canvases.entries()) {
      passSlice = { from: 0.3 + (0.65 * i) / canvases.length, size: 0.65 / canvases.length }
      onProgress?.(passSlice.from, 'recognize')
      const { data } = await worker.recognize(canvas)
      texts.push(data.text ?? '')
      passes.push(parseInbodyText(texts[i]))
      // A clean first read needs no second opinion.
      if (i === 0 && passes[0].issues.length === 0) break
    }
    onProgress?.(0.95, 'parse')
    const parsed = mergeParsed(passes)
    onProgress?.(1, 'done')
    return { text: texts.join('\n\n---\n\n'), parsed }
  } finally {
    progressListener = undefined
  }
}

/**
 * Recognises a photo of an InBody 170 receipt.
 * The Tesseract worker is created lazily on the first call and reused.
 */
export function recognizeInbody(file: Blob, onProgress?: OcrProgress): Promise<{ text: string; parsed: ParsedScan }> {
  const job = queue.then(() => run(file, onProgress))
  queue = job.catch(() => {})
  return job
}

/** Terminates the shared worker (frees ~100 MB of wasm memory). Safe to call anytime. */
export async function terminateOcr(): Promise<void> {
  const pending = workerPromise
  workerPromise = null
  if (!pending) return
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // worker failed to start: nothing to terminate
  }
}
