/*
 * InBody receipt recognition with Google Gemini (free tier).
 *
 * The phone sends a cropped JPEG of the receipt straight to the Gemini API with the
 * user's own key (stored only on the device). Gemini answers with JSON; we turn it
 * into a canonical receipt text and run it through the same parser as Tesseract, so
 * the same range and cross-checks highlight anything doubtful.
 */
import { parseInbodyText } from './parse'
import type { ParsedScan } from './types'

export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'] as const
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0]
const API = 'https://generativelanguage.googleapis.com/v1beta'

type Seg = { right_arm: number | null; left_arm: number | null; trunk: number | null; right_leg: number | null; left_leg: number | null }

/** Shape Gemini is asked to return (snake_case, as printed on the receipt). */
export interface GeminiScan {
  date: string | null
  height_cm: number | null
  weight_kg: number | null
  muscle_kg: number | null
  fat_kg: number | null
  tbw_l: number | null
  ffm_kg: number | null
  bmi: number | null
  pbf_percent: number | null
  whr: number | null
  visceral_level: number | null
  bmr_kcal: number | null
  fitness_score: number | null
  segmental_lean_kg: Seg
  segmental_fat_kg: Seg
}

const num = { type: 'number', nullable: true }
const segSchema = {
  type: 'object',
  properties: { right_arm: num, left_arm: num, trunk: num, right_leg: num, left_leg: num },
  required: ['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg'],
}
export const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string', nullable: true, description: 'Scan date as YYYY-MM-DD' },
    height_cm: num,
    weight_kg: num,
    muscle_kg: num,
    fat_kg: num,
    tbw_l: num,
    ffm_kg: num,
    bmi: num,
    pbf_percent: num,
    whr: num,
    visceral_level: num,
    bmr_kcal: num,
    fitness_score: num,
    segmental_lean_kg: segSchema,
    segmental_fat_kg: segSchema,
  },
  required: [
    'date', 'height_cm', 'weight_kg', 'muscle_kg', 'fat_kg', 'tbw_l', 'ffm_kg', 'bmi', 'pbf_percent',
    'whr', 'visceral_level', 'bmr_kcal', 'fitness_score', 'segmental_lean_kg', 'segmental_fat_kg',
  ],
}

export const GEMINI_PROMPT = `This photo shows a printed InBody 170 body-composition receipt (thermal paper, English labels).
Read the values exactly as printed and return them as JSON with the given schema.

Rules:
- Use the measured value, never the reference range printed in parentheses (e.g. "(68.9~93.3)").
- date: the header shows MM/DD/YY (e.g. "11/01/26" = 2026-11-01). Return YYYY-MM-DD.
- height_cm: from the header line "Height".
- Body Composition Analysis: weight_kg = Weight, muscle_kg = Muscle, fat_kg = Fat, tbw_l = TBW, ffm_kg = FFM.
- Obesity Analysis: bmi = BMI, pbf_percent = PBF, whr = WHR, visceral_level = Visceral Fat level, bmr_kcal = BMR.
- segmental_lean_kg: the "Segmental Lean" table, column "Lean Mass(kg)".
- segmental_fat_kg: the "Segmental Fat" table has two numbers per row: PBF(%) then Fat Mass(kg). Return the SECOND number (Fat Mass in kg).
- Ignore "Muscle - Fat Control" and "Impedance".
- Keep the decimals exactly as printed (77.4, 4.61, 0.89). Do not round or guess.
- If a value is not legible, return null for it.`

export class GeminiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

/** Human message (Ukrainian) for an API failure. */
export function describeGeminiError(e: unknown): string {
  if (e instanceof GeminiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return 'Ключ Gemini недійсний — перевір його в Налаштуваннях.'
    if (e.status === 401 || e.status === 403) return 'Ключ Gemini не має доступу — перевір його в Налаштуваннях.'
    if (e.status === 429) return 'Ліміт безкоштовних запитів Gemini вичерпано, спробуй пізніше.'
    if (e.status === 404) return 'Модель Gemini недоступна — обери іншу в Налаштуваннях.'
    if (e.status >= 500) return 'Сервер Gemini зараз не відповідає.'
    return `Gemini: ${e.message}`
  }
  if (e instanceof TypeError) return 'Немає з’єднання з Gemini.'
  return e instanceof Error ? e.message : String(e)
}

/** Request bodies to try, newest API shape first (the structured-output keys changed over time). */
export function requestBodies(imageBase64: string, mimeType: string): object[] {
  const contents = [{ role: 'user', parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }]
  return [
    { contents, generationConfig: { temperature: 0, responseFormat: { text: { mimeType: 'application/json', schema: GEMINI_SCHEMA } } } },
    { contents, generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA } },
    { contents, generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
  ]
}

/** Pulls the JSON object out of a generateContent response (tolerates ```json fences). */
export function extractJson(response: unknown): unknown {
  const parts = (response as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((p) => p.text ?? '').join('').trim()
  if (!text) throw new GeminiError(0, 'порожня відповідь')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new GeminiError(0, 'відповідь не містить JSON')
  return JSON.parse(text.slice(start, end + 1))
}

const n = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'))
  return null
}

/**
 * Writes Gemini's values back as a clean receipt and parses that, so the same
 * plausibility and cross-checks as for Tesseract mark anything suspicious.
 */
export function geminiToParsed(raw: unknown): ParsedScan {
  const g = (raw ?? {}) as Partial<Record<keyof GeminiScan, unknown>>
  const seg = (v: unknown) => (v ?? {}) as Record<string, unknown>
  const lean = seg(g.segmental_lean_kg)
  const fat = seg(g.segmental_fat_kg)
  const lines: string[] = []
  const date = typeof g.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : null
  const header = date ? `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(2, 4)} 00:00` : ''
  lines.push(`InBody170 ${header}`.trim())
  const h = n(g.height_cm)
  if (h !== null) lines.push(`Height : ${h} cm`)
  const add = (label: string, v: unknown, unit = '') => {
    const x = n(v)
    if (x !== null) lines.push(`${label} ${x}${unit ? ' ' + unit : ''}`)
  }
  lines.push('Body Composition Analysis')
  add('Weight', g.weight_kg, 'kg')
  add('Muscle', g.muscle_kg, 'kg')
  add('Fat', g.fat_kg, 'kg')
  add('TBW', g.tbw_l, 'l')
  add('FFM', g.ffm_kg, 'kg')
  lines.push('Obesity Analysis')
  add('BMI', g.bmi, 'kg/m2')
  add('PBF', g.pbf_percent, '%')
  add('WHR', g.whr)
  add('Visceral Fat', g.visceral_level, 'level')
  add('BMR', g.bmr_kcal, 'kcal')
  const rows: [string, string][] = [
    ['Right Arm', 'right_arm'],
    ['Left Arm', 'left_arm'],
    ['Trunk', 'trunk'],
    ['Right Leg', 'right_leg'],
    ['Left Leg', 'left_leg'],
  ]
  lines.push('Segmental Lean')
  for (const [label, key] of rows) add(label, lean[key], 'Over')
  lines.push('Segmental Fat')
  for (const [label, key] of rows) {
    const x = n(fat[key])
    // The parser expects "PBF% FatMass" in this table; the percentage isn't needed, so write a placeholder.
    if (x !== null) lines.push(`${label} 0.0 ${x} Under`)
  }
  add('Fitness Score', g.fitness_score, 'Points')
  const parsed = parseInbodyText(lines.join('\n'))
  if (!date) parsed.issues = [...parsed.issues.filter((i) => i.field !== 'date'), { field: 'date', message: 'Gemini не прочитав дату, вкажи її.' }]
  return parsed
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function call(model: string, key: string, body: object, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      /* not JSON */
    }
    throw new GeminiError(res.status, msg)
  }
  return res.json()
}

/**
 * Recognises a receipt image with Gemini. Tries the newest structured-output request
 * format, then older ones (400 = format not understood); on a missing/limited model
 * (404/429) falls back to the next free model.
 */
export async function recognizeWithGemini(
  image: Blob,
  key: string,
  model: string = DEFAULT_GEMINI_MODEL,
  signal?: AbortSignal,
): Promise<{ parsed: ParsedScan; raw: unknown; model: string }> {
  const data = await blobToBase64(image)
  const bodies = requestBodies(data, image.type || 'image/jpeg')
  const models = [model, ...GEMINI_MODELS.filter((m) => m !== model)]
  let lastError: unknown
  for (const m of models) {
    for (const body of bodies) {
      try {
        const raw = extractJson(await call(m, key, body, signal))
        return { parsed: geminiToParsed(raw), raw, model: m }
      } catch (e) {
        lastError = e
        const badKey = e instanceof GeminiError && (e.status === 401 || e.status === 403 || (e.status === 400 && /api key/i.test(e.message)))
        if (badKey || e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError')) throw e // other models won't help
        if (e instanceof GeminiError && e.status === 400 && !/api key/i.test(e.message)) continue // try older body format
        if (e instanceof GeminiError && e.status === 0) continue // unusable answer: try the next format
        break // other errors: next model or give up
      }
    }
  }
  throw lastError
}

/** Cheap key check for the Settings screen. */
export async function checkGeminiKey(key: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } })
    if (res.ok) return { ok: true }
    let msg = res.statusText
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      /* ignore */
    }
    return { ok: false, message: describeGeminiError(new GeminiError(res.status, msg)) }
  } catch (e) {
    return { ok: false, message: describeGeminiError(e) }
  }
}
