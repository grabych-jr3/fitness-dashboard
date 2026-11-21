import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractJson, GeminiError, geminiToParsed, recognizeWithGemini, requestBodies } from './gemini.ts'

const RECEIPT = {
  date: '2026-11-01',
  height_cm: 192,
  weight_kg: 77.4,
  muscle_kg: 41.4,
  fat_kg: 5.6,
  tbw_l: 52.8,
  ffm_kg: 71.8,
  bmi: 21.0,
  pbf_percent: 7.2,
  whr: 0.89,
  visceral_level: 1,
  bmr_kcal: 1921,
  fitness_score: 79,
  segmental_lean_kg: { right_arm: 4.61, left_arm: 4.77, trunk: 34.5, right_leg: 11.91, left_leg: 11.92 },
  segmental_fat_kg: { right_arm: 0.1, left_arm: 0.1, trunk: 2.1, right_leg: 1.1, left_leg: 1.1 },
}

const reply = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] } }] })
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status })

afterEach(() => vi.unstubAllGlobals())

describe('geminiToParsed', () => {
  it('maps a full answer to every field with no doubts', () => {
    const p = geminiToParsed(RECEIPT)
    expect(p).toMatchObject({ date: '2026-11-01', weight: 77.4, muscle: 41.4, fatKg: 5.6, tbw: 52.8, ffm: 71.8, bmi: 21, pbf: 7.2, whr: 0.89, visceral: 1, bmr: 1921, fitnessScore: 79 })
    expect(p.lean).toEqual({ ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 })
    expect(p.fat).toEqual({ ra: 0.1, la: 0.1, tr: 2.1, rl: 1.1, ll: 1.1 })
    expect(p.issues).toEqual([])
  })

  it('flags a value that breaks the cross-checks and a missing date', () => {
    const p = geminiToParsed({ ...RECEIPT, date: null, pbf_percent: 17.2 })
    const fields = p.issues.map((i) => i.field)
    expect(fields).toContain('pbf')
    expect(fields).toContain('date')
  })

  it('accepts numbers sent as strings and leaves unknown fields empty', () => {
    const p = geminiToParsed({ weight_kg: '77,4', muscle_kg: null })
    expect(p.weight).toBe(77.4)
    expect(p.muscle).toBeNull()
  })
})

describe('extractJson', () => {
  it('reads JSON inside code fences', () => {
    expect(extractJson(reply({ a: 1 }))).toEqual({ a: 1 })
  })
  it('rejects an empty answer', () => {
    expect(() => extractJson({ candidates: [] })).toThrow(GeminiError)
  })
})

describe('recognizeWithGemini', () => {
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })

  it('sends the key in a header and the photo inline', async () => {
    const fetchMock = vi.fn(async () => ok(reply(RECEIPT)))
    vi.stubGlobal('fetch', fetchMock)
    const r = await recognizeWithGemini(image, 'KEY', 'gemini-3.8-flash')
    expect(r.parsed.weight).toBe(77.4)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-3.8-flash:generateContent')
    expect(url).not.toContain('KEY')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY')
    const body = JSON.parse(String(init.body))
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg')
  })

  it('falls back to an older request format on 400', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(400, 'Unknown name "responseFormat"')).mockResolvedValueOnce(ok(reply(RECEIPT)))
    vi.stubGlobal('fetch', fetchMock)
    const r = await recognizeWithGemini(image, 'KEY')
    expect(r.parsed.bmr).toBe(1921)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).generationConfig.responseMimeType).toBe('application/json')
  })

  it('falls back to another free model on 404 / 429', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(429, 'quota')).mockResolvedValueOnce(ok(reply(RECEIPT)))
    vi.stubGlobal('fetch', fetchMock)
    const r = await recognizeWithGemini(image, 'KEY', 'gemini-3.8-flash')
    expect(r.model).toBe('gemini-3.6-flash')
  })

  it('stops on a bad key', async () => {
    const fetchMock = vi.fn(async () => fail(400, 'API key not valid. Please pass a valid API key.'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(recognizeWithGemini(image, 'BAD')).rejects.toMatchObject({ status: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('builds three request variants', () => {
    expect(requestBodies('AAA', 'image/jpeg')).toHaveLength(3)
  })
})
