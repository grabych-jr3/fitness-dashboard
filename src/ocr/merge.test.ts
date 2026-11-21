import { describe, expect, it } from 'vitest'
import REAL_2000 from './__fixtures__/inbody-real-photo-2000.txt?raw'
import REAL_3000 from './__fixtures__/inbody-real-photo-3000.txt?raw'
import BROWSER_A from './__fixtures__/inbody-real-browser-2000.txt?raw'
import BROWSER_B from './__fixtures__/inbody-real-browser-3000.txt?raw'
import { mergeParsed } from './merge.ts'
import { parseInbodyText } from './parse.ts'

/**
 * The two fixtures are real Tesseract output for a phone photo of the
 * 01.11.2026 receipt (cropped to the paper, at two scales). Each pass alone
 * gets some fields wrong; merged, the main body-composition fields are right.
 */
describe('mergeParsed on real phone-photo OCR', () => {
  const merged = mergeParsed([parseInbodyText(REAL_2000), parseInbodyText(REAL_3000)])

  it('gets the main fields right', () => {
    expect(merged).toMatchObject({
      date: '2026-11-01',
      weight: 77.4,
      muscle: 41.4,
      fatKg: 5.6,
      pbf: 7.2,
      tbw: 52.8,
      ffm: 71.8,
      bmi: 21,
      whr: 0.89,
      visceral: 1,
      bmr: 1921,
      fitnessScore: 79,
    })
    expect(merged.lean).toEqual({ ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 })
  })

  it('keeps doubts for what still needs checking', () => {
    const fields = new Set(merged.issues.map((i) => i.field))
    expect(fields.has('fat.ra')).toBe(true) // garbled on the photo
    expect(merged.confidence).toBeGreaterThan(0.5)
  })

  it('returns a single pass unchanged', () => {
    const one = parseInbodyText(REAL_2000)
    expect(mergeParsed([one])).toBe(one)
  })
})

describe('mergeParsed on the in-browser pipeline output', () => {
  // Real text from the app's own crop + two passes in Chrome, for the same photo.
  const merged = mergeParsed([parseInbodyText(BROWSER_A), parseInbodyText(BROWSER_B)])

  it('reads the body composition correctly', () => {
    expect(merged).toMatchObject({ weight: 77.4, muscle: 41.4, fatKg: 5.6, pbf: 7.2, tbw: 52.8, ffm: 71.8, bmi: 21, whr: 0.89, bmr: 1921, fitnessScore: 79 })
    expect(merged.lean).toEqual({ ra: 4.61, la: 4.77, tr: 34.5, rl: 11.91, ll: 11.92 })
  })

  it('drops doubts that the cross-checks confirm but keeps the rest', () => {
    const fields = new Set(merged.issues.map((i) => i.field))
    for (const f of ['weight', 'fatKg', 'pbf', 'tbw']) expect(fields.has(f)).toBe(false)
    expect(fields.has('date')).toBe(true) // unreadable on this photo
  })
})
